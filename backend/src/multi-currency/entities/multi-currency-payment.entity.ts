import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Payment } from '../../entities/payment.entity';

/**
 * Entity to track multi-currency payments with conversion details
 * Records the original asset paid, converted asset received, exchange rate, and path payment details
 */
@Entity('multi_currency_payments')
@Index(['paymentId'])
@Index(['pathPaymentTxHash'])
export class MultiCurrencyPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  paymentId!: string;

  /**
   * Asset that was paid by the participant (e.g., 'XLM', 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
   */
  @Column({ type: 'varchar', length: 100 })
  paidAsset!: string;

  /**
   * Amount paid in the original asset
   */
  @Column({ type: 'decimal', precision: 20, scale: 7 })
  paidAmount!: number;

  /**
   * Asset that was received after conversion (creator's preferred currency)
   * e.g., 'XLM', 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
   */
  @Column({ type: 'varchar', length: 100 })
  receivedAsset!: string;

  /**
   * Amount received after conversion
   */
  @Column({ type: 'decimal', precision: 20, scale: 7 })
  receivedAmount!: number;

  /**
   * Exchange rate at time of payment (receivedAmount / paidAmount)
   */
  @Column({ type: 'decimal', precision: 20, scale: 10 })
  exchangeRate!: number;

  /**
   * Transaction hash of the path payment (if conversion was done via path payment)
   * Null if payment was already in the correct currency
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  pathPaymentTxHash?: string | null;

  /**
   * Slippage percentage (difference between expected and actual rate)
   */
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  slippagePercentage?: number | null;

  /**
   * Expected amount based on quoted rate
   */
  @Column({ type: 'decimal', precision: 20, scale: 7, nullable: true })
  expectedAmount?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  // Relationship to Payment
  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment?: Payment;
}
