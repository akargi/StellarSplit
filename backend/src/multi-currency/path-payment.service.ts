import { Injectable, Logger } from '@nestjs/common';
import {
  Horizon,
  Asset,
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
} from '@stellar/stellar-sdk';
import { ExchangeRateTrackerService } from './exchange-rate-tracker.service';

export interface PathPaymentOptions {
  sourceAccount: string;
  sourceSecret?: string; // Optional, only if building transaction
  destinationAccount: string;
  sourceAsset: Asset;
  destinationAsset: Asset;
  destinationAmount: number;
  maxSourceAmount?: number;
  slippageTolerance?: number; // Percentage (0.01 = 1%)
}

export interface PathPaymentResult {
  success: boolean;
  txHash?: string;
  sourceAmount: number;
  destinationAmount: number;
  path: Asset[];
  exchangeRate: number;
  slippage?: number;
  error?: string;
}

@Injectable()
export class PathPaymentService {
  private readonly logger = new Logger(PathPaymentService.name);
  private readonly horizonServer: Horizon.Server;
  private readonly networkPassphrase: string;

  constructor(
    private readonly exchangeRateTracker: ExchangeRateTrackerService,
  ) {
    const isMainnet = process.env.STELLAR_NETWORK === 'mainnet';
    this.horizonServer = new Horizon.Server(
      isMainnet
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org',
    );
    this.networkPassphrase = isMainnet
      ? Networks.PUBLIC
      : Networks.TESTNET;
  }

  /**
   * Find the best path for a path payment
   * Uses Stellar's strict receive path payment to find optimal conversion path
   */
  async findBestPath(
    sourceAsset: Asset,
    destinationAsset: Asset,
    destinationAmount: number,
  ): Promise<{
    sourceAmount: number;
    path: Asset[];
    rate: number;
  }> {
    try {
      this.logger.log(
        `Finding best path for ${destinationAmount} ${this.exchangeRateTracker.formatAsset(destinationAsset)}`,
      );

      // Query strict receive paths
      // strictReceivePaths expects source assets as array or string
      const paths = await this.horizonServer
        .strictReceivePaths(
          [sourceAsset],
          destinationAsset,
          destinationAmount.toString(),
        )
        .call();

      if (paths.records.length === 0) {
        throw new Error(
          `No path found from ${this.exchangeRateTracker.formatAsset(sourceAsset)} to ${this.exchangeRateTracker.formatAsset(destinationAsset)} for amount ${destinationAmount}`,
        );
      }

      // Get the best path (first record is usually the best)
      const bestPath = paths.records[0];
      const sourceAmount = parseFloat(bestPath.source_amount);
      const rate = destinationAmount / sourceAmount;

      // Extract path assets
      const path: Asset[] = bestPath.path.map((asset: any) => {
        if (asset.asset_type === 'native') {
          return Asset.native();
        }
        return new Asset(asset.asset_code, asset.asset_issuer);
      });

      this.logger.log(
        `Best path found: ${sourceAmount} ${this.exchangeRateTracker.formatAsset(sourceAsset)} -> ${destinationAmount} ${this.exchangeRateTracker.formatAsset(destinationAsset)} (rate: ${rate})`,
      );

      return {
        sourceAmount,
        path,
        rate,
      };
    } catch (error: any) {
      this.logger.error(`Error finding best path: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Build a path payment strict receive transaction
   * This creates a transaction that can be signed and submitted by the client
   */
  async buildPathPaymentTransaction(
    options: PathPaymentOptions,
  ): Promise<{
    transactionXDR: string;
    sourceAmount: number;
    destinationAmount: number;
    path: Asset[];
    exchangeRate: number;
    maxSourceAmount: number;
  }> {
    try {
      const {
        sourceAccount,
        destinationAccount,
        sourceAsset,
        destinationAsset,
        destinationAmount,
        slippageTolerance = 0.01, // 1% default
      } = options;

      // Find best path
      const pathInfo = await this.findBestPath(
        sourceAsset,
        destinationAsset,
        destinationAmount,
      );

      // Calculate max source amount with slippage tolerance
      const maxSourceAmount = pathInfo.sourceAmount * (1 + slippageTolerance);

      // Get source account details
      const account = await this.horizonServer
        .loadAccount(sourceAccount);

      // Build transaction
      const transaction = new TransactionBuilder(account, {
        fee: '100', // Base fee
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictReceive({
            sendAsset: sourceAsset,
            sendMax: maxSourceAmount.toString(),
            destination: destinationAccount,
            destAsset: destinationAsset,
            destAmount: destinationAmount.toString(),
            path: pathInfo.path,
          }),
        )
        .setTimeout(180) // 3 minutes
        .build();

      const transactionXDR = transaction.toXDR();

      this.logger.log(
        `Built path payment transaction: ${maxSourceAmount} ${this.exchangeRateTracker.formatAsset(sourceAsset)} -> ${destinationAmount} ${this.exchangeRateTracker.formatAsset(destinationAsset)}`,
      );

      return {
        transactionXDR,
        sourceAmount: pathInfo.sourceAmount,
        destinationAmount,
        path: pathInfo.path,
        exchangeRate: pathInfo.rate,
        maxSourceAmount,
      };
    } catch (error: any) {
      this.logger.error(
        `Error building path payment transaction: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Verify a path payment transaction
   * Checks if a transaction hash represents a valid path payment
   */
  async verifyPathPayment(txHash: string): Promise<PathPaymentResult> {
    try {
      this.logger.log(`Verifying path payment transaction: ${txHash}`);

      // Fetch transaction
      const transaction = await this.horizonServer
        .transactions()
        .transaction(txHash)
        .call();

      if (!transaction || !transaction.successful) {
        return {
          success: false,
          sourceAmount: 0,
          destinationAmount: 0,
          path: [],
          exchangeRate: 0,
          error: 'Transaction not found or unsuccessful',
        };
      }

      // Get operations
      const operations = await this.horizonServer
        .operations()
        .forTransaction(txHash)
        .call();

      // Find path payment operation
      const pathPaymentOp = operations.records.find(
        (op: any) =>
          op.type === 'path_payment_strict_receive' ||
          op.type === 'path_payment_strict_send',
      );

      if (!pathPaymentOp) {
        return {
          success: false,
          sourceAmount: 0,
          destinationAmount: 0,
          path: [],
          exchangeRate: 0,
          error: 'No path payment operation found',
        };
      }

      let sourceAmount = 0;
      let destinationAmount = 0;
      let sourceAsset: Asset;
      let destinationAsset: Asset;
      const path: Asset[] = [];

      if (pathPaymentOp.type === 'path_payment_strict_receive') {
        const op = pathPaymentOp as any;
        sourceAmount = parseFloat(op.source_amount);
        destinationAmount = parseFloat(op.amount);

        sourceAsset =
          op.source_asset_type === 'native'
            ? Asset.native()
            : new Asset(op.source_asset_code, op.source_asset_issuer);
        destinationAsset =
          op.dest_asset_type === 'native'
            ? Asset.native()
            : new Asset(op.dest_asset_code, op.dest_asset_issuer);

        // Extract path
        if (op.path) {
          path.push(
            ...op.path.map((asset: any) => {
              if (asset.asset_type === 'native') {
                return Asset.native();
              }
              return new Asset(asset.asset_code, asset.asset_issuer);
            }),
          );
        }
      } else if (pathPaymentOp.type === 'path_payment_strict_send') {
        const op = pathPaymentOp as any;
        sourceAmount = parseFloat(op.amount);
        destinationAmount = parseFloat(op.destination_amount);

        sourceAsset =
          op.asset_type === 'native'
            ? Asset.native()
            : new Asset(op.asset_code, op.asset_issuer);
        destinationAsset =
          op.destination_asset_type === 'native'
            ? Asset.native()
            : new Asset(op.destination_asset_code, op.destination_asset_issuer);

        // Extract path
        if (op.path) {
          path.push(
            ...op.path.map((asset: any) => {
              if (asset.asset_type === 'native') {
                return Asset.native();
              }
              return new Asset(asset.asset_code, asset.asset_issuer);
            }),
          );
        }
      } else {
        return {
          success: false,
          sourceAmount: 0,
          destinationAmount: 0,
          path: [],
          exchangeRate: 0,
          error: 'Invalid path payment operation type',
        };
      }

      const exchangeRate = destinationAmount / sourceAmount;

      this.logger.log(
        `Path payment verified: ${sourceAmount} ${this.exchangeRateTracker.formatAsset(sourceAsset)} -> ${destinationAmount} ${this.exchangeRateTracker.formatAsset(destinationAsset)}`,
      );

      return {
        success: true,
        txHash,
        sourceAmount,
        destinationAmount,
        path,
        exchangeRate,
      };
    } catch (error: any) {
      this.logger.error(
        `Error verifying path payment: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        sourceAmount: 0,
        destinationAmount: 0,
        path: [],
        exchangeRate: 0,
        error: error.message,
      };
    }
  }

  /**
   * Calculate slippage for a path payment
   */
  calculateSlippage(
    expectedAmount: number,
    actualAmount: number,
  ): number {
    if (expectedAmount === 0) return 0;
    return Math.abs((actualAmount - expectedAmount) / expectedAmount) * 100;
  }

  /**
   * Check if slippage is within tolerance
   */
  isSlippageAcceptable(
    expectedAmount: number,
    actualAmount: number,
    tolerance: number,
  ): boolean {
    const slippage = this.calculateSlippage(expectedAmount, actualAmount);
    return slippage <= tolerance * 100; // Convert to percentage
  }
}
