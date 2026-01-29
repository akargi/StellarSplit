# Multi-Currency Settlement System

## Overview

The Multi-Currency Settlement System enables StellarSplit to handle payments in different currencies with automatic conversion. Participants can pay in any supported Stellar asset (XLM, USDC, EURC, etc.), and the system automatically converts payments to the creator's preferred currency at the time of payment.

## Features

- ✅ **Multiple Asset Support**: Accept payments in XLM, USDC, EURC, and other Stellar assets
- ✅ **Automatic Conversion**: Path payments automatically convert between assets
- ✅ **Exchange Rate Tracking**: Records exchange rates at payment time
- ✅ **Slippage Handling**: Configurable slippage tolerance for conversions
- ✅ **Path Payment Support**: Uses Stellar's path payment operations for optimal rates
- ✅ **Settlement in Preferred Currency**: All payments settle in the creator's preferred currency

## Architecture

### Core Components

#### 1. MultiCurrencyService (`multi-currency.service.ts`)
Main service for processing multi-currency payments. Handles:
- Payment processing with currency conversion
- Integration with payment processor
- Path payment transaction building

#### 2. ExchangeRateTrackerService (`exchange-rate-tracker.service.ts`)
Tracks and queries exchange rates:
- Queries Stellar liquidity pools for best rates
- Finds optimal conversion paths
- Records exchange rates at payment time
- Calculates slippage

#### 3. PathPaymentService (`path-payment.service.ts`)
Handles Stellar path payment operations:
- Builds path payment transactions
- Finds best conversion paths
- Verifies path payment transactions
- Calculates slippage tolerance

#### 4. MultiCurrencyPayment Entity
Database entity that tracks:
- Original asset paid
- Converted asset received
- Exchange rate at payment time
- Path payment transaction hash
- Slippage information

## Supported Assets

The system supports the following Stellar assets:

- **XLM** (Native Stellar Lumens)
- **USDC** (Circle USD Coin): `USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- **EURC** (Circle Euro Coin): `EURC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`

Additional assets can be added by updating the `getSupportedAssets()` method in `ExchangeRateTrackerService`.

## Asset Format

Assets are represented as strings in the following formats:

- **Native XLM**: `"XLM"` or `"native"`
- **Credit Assets**: `"CODE:ISSUER"` (e.g., `"USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"`)

## API Endpoints

### GET `/api/payments/path-payment/:splitId/:participantId`
Get a path payment transaction for multi-currency conversion.

**Query Parameters:**
- `sourceAsset` (required): Asset to pay with (e.g., `"USDC:GA5Z..."`)
- `destinationAmount` (required): Amount to receive in destination asset
- `slippageTolerance` (optional): Slippage tolerance (default: 0.01 = 1%)

**Response:**
```json
{
  "transactionXDR": "AAAAA...",
  "sourceAmount": 50.0,
  "destinationAmount": 100.0,
  "path": ["XLM"],
  "exchangeRate": 2.0,
  "maxSourceAmount": 50.5
}
```

### GET `/api/payments/supported-assets`
Get list of supported assets.

**Response:**
```json
{
  "assets": [
    "XLM",
    "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "EURC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  ]
}
```

### GET `/api/payments/multi-currency/:paymentId`
Get multi-currency payment details.

**Response:**
```json
{
  "id": "uuid",
  "paymentId": "uuid",
  "paidAsset": "USDC:GA5Z...",
  "paidAmount": 50.0,
  "receivedAsset": "XLM",
  "receivedAmount": 100.0,
  "exchangeRate": 2.0,
  "pathPaymentTxHash": "tx-hash",
  "slippagePercentage": 0.5,
  "expectedAmount": 100.0,
  "createdAt": "2026-01-27T00:00:00Z"
}
```

## Usage Examples

### Creating a Split with Preferred Currency

```typescript
const split = {
  totalAmount: 100,
  preferredCurrency: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  creatorWalletAddress: 'GCREATOR123456789012345678901234567890123456789012345678',
  // ... other fields
};
```

### Processing a Multi-Currency Payment

When a participant pays in a different currency, the system automatically:

1. Detects the payment asset
2. Queries for the best exchange rate
3. Converts to the preferred currency
4. Tracks the exchange rate
5. Records slippage if applicable

```typescript
// Payment is automatically processed with conversion
await paymentProcessorService.processPaymentSubmission(
  splitId,
  participantId,
  txHash, // Path payment transaction hash
);
```

### Building a Path Payment Transaction

For clients that need to build path payment transactions:

```typescript
const transactionInfo = await multiCurrencyService.getPathPaymentTransaction(
  splitId,
  participantId,
  'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Source asset
  100.0, // Destination amount
  0.01, // 1% slippage tolerance
);

// Sign and submit the transaction
const transaction = TransactionBuilder.fromXDR(transactionInfo.transactionXDR, Networks.TESTNET);
transaction.sign(keypair);
await server.submitTransaction(transaction);
```

## Exchange Rate Tracking

The system tracks exchange rates at the time of payment:

- **Rate**: `receivedAmount / paidAmount`
- **Slippage**: Difference between expected and actual rate
- **Path**: Conversion path used (if multiple hops)

All rates are stored in the `multi_currency_payments` table for audit and reporting.

## Slippage Tolerance

Slippage tolerance is configurable per payment:

- **Default**: 1% (0.01)
- **Purpose**: Accounts for price movement between quote and execution
- **Calculation**: `|actualAmount - expectedAmount| / expectedAmount * 100`

If slippage exceeds tolerance, the payment may be rejected (configurable).

## Path Payments

The system uses Stellar's path payment operations for conversions:

- **Path Payment Strict Receive**: Ensures minimum amount received
- **Automatic Path Finding**: Finds optimal conversion path through liquidity pools
- **Multi-Hop Support**: Can convert through multiple intermediate assets

## Database Schema

### MultiCurrencyPayment Entity

```typescript
{
  id: UUID,
  paymentId: UUID (FK to payments),
  paidAsset: string,
  paidAmount: decimal(20,7),
  receivedAsset: string,
  receivedAmount: decimal(20,7),
  exchangeRate: decimal(20,10),
  pathPaymentTxHash: string (nullable),
  slippagePercentage: decimal(10,4) (nullable),
  expectedAmount: decimal(20,7) (nullable),
  createdAt: timestamp
}
```

### Split Entity Updates

```typescript
{
  // ... existing fields
  preferredCurrency: string (default: 'XLM'),
  creatorWalletAddress: string (nullable)
}
```

## Testing

Run integration tests:

```bash
npm test -- multi-currency.integration.test.ts
```

Test coverage includes:
- Asset parsing and validation
- Exchange rate queries
- Path payment building
- Multi-currency payment processing
- Slippage calculations
- Error handling

## Configuration

### Environment Variables

- `STELLAR_NETWORK`: `mainnet` or `testnet` (default: `testnet`)

### Slippage Tolerance

Default slippage tolerance is 1% (0.01). This can be configured per payment or globally.

## Error Handling

The system handles various error scenarios:

- **Invalid Asset Format**: Throws `BadRequestException`
- **No Conversion Path**: Throws `BadRequestException` with details
- **Slippage Exceeded**: Logs warning, may reject payment (configurable)
- **Split Not Found**: Throws `NotFoundException`
- **Participant Not Found**: Throws `NotFoundException`

## Integration with Payment Processor

The multi-currency system is automatically integrated with the payment processor:

1. Payment processor verifies transaction
2. Detects if payment is in different currency
3. Calls multi-currency service for conversion
4. Updates payment records with converted amounts
5. Tracks exchange rates and slippage

No additional configuration needed - it works automatically!

## Future Enhancements

Potential improvements:

- [ ] Support for more Stellar assets
- [ ] Real-time exchange rate updates
- [ ] Historical rate tracking and analytics
- [ ] Custom slippage policies per split
- [ ] Multi-asset split support (participants can pay in different assets)
- [ ] Automatic asset selection based on liquidity

## Support

For issues or questions:
1. Check the integration tests for examples
2. Review the service implementation files
3. Check Stellar Horizon API documentation for path payment details
