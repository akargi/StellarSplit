import { IsUUID, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, StellarAsset } from '../entities/payment.entity';

export class QueryPaymentsDto {
  @ApiPropertyOptional({
    description: 'Filter by split ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  splitId?: string;

  @ApiPropertyOptional({
    description: 'Filter by participant ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsOptional()
  participantId?: string;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: PaymentStatus,
    example: PaymentStatus.CONFIRMED,
  })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Filter by asset type',
    enum: StellarAsset,
    example: StellarAsset.XLM,
  })
  @IsEnum(StellarAsset)
  @IsOptional()
  asset?: StellarAsset;

  @ApiPropertyOptional({
    description: 'Filter by Stellar transaction hash',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
  })
  @IsString()
  @IsOptional()
  stellarTxHash?: string;
}