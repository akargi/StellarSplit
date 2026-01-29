import { Injectable, Logger } from '@nestjs/common';
import { Horizon, Asset } from '@stellar/stellar-sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MultiCurrencyPayment } from './entities/multi-currency-payment.entity';

export interface ExchangeRateInfo {
  rate: number;
  sourceAmount: number;
  destinationAmount: number;
  path: Asset[];
  timestamp: Date;
}

export interface AssetInfo {
  code: string;
  issuer?: string;
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
}

@Injectable()
export class ExchangeRateTrackerService {
  private readonly logger = new Logger(ExchangeRateTrackerService.name);
  private readonly horizonServer: Horizon.Server;

  constructor(
    @InjectRepository(MultiCurrencyPayment)
    private multiCurrencyPaymentRepository: Repository<MultiCurrencyPayment>,
  ) {
    this.horizonServer = new Horizon.Server(
      process.env.STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org',
    );
  }

  /**
   * Parse asset string to Asset object
   * Supports formats: 'XLM', 'USDC', 'USDC:GA5Z...', 'EURC:GA5Z...'
   */
  parseAsset(assetString: string): Asset {
    if (assetString === 'XLM' || assetString === 'native') {
      return Asset.native();
    }

    const parts = assetString.split(':');
    if (parts.length === 1) {
      // Assume it's a well-known asset code without issuer
      // For production, you might want to maintain a registry of well-known assets
      throw new Error(
        `Asset issuer required for non-native asset: ${assetString}. Use format: CODE:ISSUER`,
      );
    }

    const [code, issuer] = parts;
    if (code.length <= 4) {
      return new Asset(code, issuer);
    } else {
      return new Asset(code, issuer);
    }
  }

  /**
   * Format Asset to string representation
   */
  formatAsset(asset: Asset): string {
    if (asset.isNative()) {
      return 'XLM';
    }
    return `${asset.getCode()}:${asset.getIssuer()}`;
  }

  /**
   * Get the best exchange rate for converting from source asset to destination asset
   * Queries Stellar liquidity pools and orderbooks to find the best rate
   */
  async getBestExchangeRate(
    sourceAsset: Asset,
    destinationAsset: Asset,
    sourceAmount: number,
    slippageTolerance: number = 0.01, // 1% default slippage tolerance
  ): Promise<ExchangeRateInfo> {
    try {
      this.logger.log(
        `Getting exchange rate: ${this.formatAsset(sourceAsset)} -> ${this.formatAsset(destinationAsset)} for amount ${sourceAmount}`,
      );

      // If same asset, return 1:1 rate
      if (
        sourceAsset.isNative() === destinationAsset.isNative() &&
        (sourceAsset.isNative() ||
          (sourceAsset.getCode() === destinationAsset.getCode() &&
            sourceAsset.getIssuer() === destinationAsset.getIssuer()))
      ) {
        return {
          rate: 1.0,
          sourceAmount,
          destinationAmount: sourceAmount,
          path: [],
          timestamp: new Date(),
        };
      }

      // Query orderbook for best rate
      // Note: orderbook() expects selling and buying assets
      const orderbook = await this.horizonServer
        .orderbook(sourceAsset, destinationAsset)
        .call();

      // Calculate destination amount from orderbook
      let remainingAmount = sourceAmount;
      let totalReceived = 0;
      const path: Asset[] = [];

      // Use bids (selling destination asset) to calculate how much we can get
      for (const bid of orderbook.bids) {
        if (remainingAmount <= 0) break;

        const bidPrice = parseFloat(bid.price);
        const bidAmount = parseFloat(bid.amount);

        if (remainingAmount >= bidAmount) {
          // Use entire bid
          totalReceived += bidAmount * bidPrice;
          remainingAmount -= bidAmount;
        } else {
          // Use partial bid
          totalReceived += remainingAmount * bidPrice;
          remainingAmount = 0;
        }
      }

      // If orderbook doesn't have enough liquidity, try path payment simulation
      if (remainingAmount > 0 || totalReceived === 0) {
        return await this.findPathPaymentRate(
          sourceAsset,
          destinationAsset,
          sourceAmount,
        );
      }

      const rate = totalReceived / sourceAmount;
      const slippageAdjustedAmount = totalReceived * (1 - slippageTolerance);

      this.logger.log(
        `Exchange rate found: ${rate} (${sourceAmount} ${this.formatAsset(sourceAsset)} = ${totalReceived} ${this.formatAsset(destinationAsset)})`,
      );

      return {
        rate,
        sourceAmount,
        destinationAmount: slippageAdjustedAmount,
        path,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(
        `Error getting exchange rate: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find exchange rate using path payment simulation
   * This queries Stellar's path payment strict receive endpoint
   */
  private async findPathPaymentRate(
    sourceAsset: Asset,
    destinationAsset: Asset,
    sourceAmount: number,
  ): Promise<ExchangeRateInfo> {
    try {
      // Use path payment strict receive to find best path
      // strictReceivePaths expects source assets as array or string
      const pathPayment = await this.horizonServer
        .strictReceivePaths(
          [sourceAsset],
          destinationAsset,
          sourceAmount.toString(),
        )
        .call();

      if (pathPayment.records.length === 0) {
        throw new Error(
          `No path found from ${this.formatAsset(sourceAsset)} to ${this.formatAsset(destinationAsset)}`,
        );
      }

      // Get the best path (first one is usually the best)
      const bestPath = pathPayment.records[0];
      const destinationAmount = parseFloat(bestPath.destination_amount);
      const rate = destinationAmount / sourceAmount;

      // Extract path assets
      const path: Asset[] = bestPath.path.map((asset: any) => {
        if (asset.asset_type === 'native') {
          return Asset.native();
        }
        return new Asset(asset.asset_code, asset.asset_issuer);
      });

      this.logger.log(
        `Path payment rate found: ${rate} via path with ${path.length} hops`,
      );

      return {
        rate,
        sourceAmount,
        destinationAmount,
        path,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(
        `Error finding path payment rate: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Track exchange rate at payment time
   * Saves the exchange rate information to the database
   */
  async trackExchangeRate(
    paymentId: string,
    paidAsset: string,
    paidAmount: number,
    receivedAsset: string,
    receivedAmount: number,
    exchangeRate: number,
    pathPaymentTxHash: string | null = null,
    expectedAmount?: number,
  ): Promise<MultiCurrencyPayment> {
    try {
      // Calculate slippage if expected amount is provided
      let slippagePercentage: number | null = null;
      if (expectedAmount !== undefined) {
        const slippage = Math.abs((receivedAmount - expectedAmount) / expectedAmount) * 100;
        slippagePercentage = slippage;
      }

      const multiCurrencyPayment = this.multiCurrencyPaymentRepository.create({
        paymentId,
        paidAsset,
        paidAmount,
        receivedAsset,
        receivedAmount,
        exchangeRate,
        pathPaymentTxHash,
        slippagePercentage,
        expectedAmount,
      });

      const saved = await this.multiCurrencyPaymentRepository.save(
        multiCurrencyPayment,
      );

      this.logger.log(
        `Tracked exchange rate for payment ${paymentId}: ${exchangeRate} (${paidAmount} ${paidAsset} -> ${receivedAmount} ${receivedAsset})`,
      );

      return saved;
    } catch (error: any) {
      this.logger.error(
        `Error tracking exchange rate: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get exchange rate history for a payment
   */
  async getExchangeRateHistory(paymentId: string): Promise<MultiCurrencyPayment | null> {
    return await this.multiCurrencyPaymentRepository.findOne({
      where: { paymentId },
    });
  }

  /**
   * Get supported Stellar assets
   * Returns list of commonly used assets on Stellar
   */
  getSupportedAssets(): string[] {
    return [
      'XLM',
      'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Circle USDC
      'EURC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Circle EURC
      // Add more supported assets as needed
    ];
  }

  /**
   * Validate if an asset string is in correct format
   */
  validateAssetFormat(assetString: string): boolean {
    if (assetString === 'XLM' || assetString === 'native') {
      return true;
    }

    const parts = assetString.split(':');
    if (parts.length !== 2) {
      return false;
    }

    const [code, issuer] = parts;
    // Asset code: 1-12 alphanumeric characters
    if (!/^[A-Z0-9]{1,12}$/.test(code)) {
      return false;
    }

    // Issuer: 56 character Stellar public key
    if (!/^G[A-Z2-7]{55}$/.test(issuer)) {
      return false;
    }

    return true;
  }
}
