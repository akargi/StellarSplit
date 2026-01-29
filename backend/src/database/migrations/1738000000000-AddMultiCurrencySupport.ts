import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMultiCurrencySupport1738000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add preferredCurrency and creatorWalletAddress to splits table
    await queryRunner.query(`
      ALTER TABLE "splits" 
      ADD COLUMN IF NOT EXISTS "preferredCurrency" character varying(100) DEFAULT 'XLM',
      ADD COLUMN IF NOT EXISTS "creatorWalletAddress" character varying(56)
    `);

    // Create multi_currency_payments table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "multi_currency_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "paymentId" uuid NOT NULL,
        "paidAsset" character varying(100) NOT NULL,
        "paidAmount" numeric(20,7) NOT NULL,
        "receivedAsset" character varying(100) NOT NULL,
        "receivedAmount" numeric(20,7) NOT NULL,
        "exchangeRate" numeric(20,10) NOT NULL,
        "pathPaymentTxHash" character varying(64),
        "slippagePercentage" numeric(10,4),
        "expectedAmount" numeric(20,7),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_multi_currency_payments_id" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_multi_currency_payments_paymentId" 
      ON "multi_currency_payments" ("paymentId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_multi_currency_payments_pathPaymentTxHash" 
      ON "multi_currency_payments" ("pathPaymentTxHash")
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "multi_currency_payments" 
      ADD CONSTRAINT "FK_multi_currency_payments_paymentId" 
      FOREIGN KEY ("paymentId") REFERENCES "payments"("id") 
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "multi_currency_payments" 
      DROP CONSTRAINT IF EXISTS "FK_multi_currency_payments_paymentId"
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_multi_currency_payments_pathPaymentTxHash"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_multi_currency_payments_paymentId"
    `);

    // Drop multi_currency_payments table
    await queryRunner.query(`DROP TABLE IF EXISTS "multi_currency_payments"`);

    // Remove columns from splits table
    await queryRunner.query(`
      ALTER TABLE "splits" 
      DROP COLUMN IF EXISTS "creatorWalletAddress",
      DROP COLUMN IF EXISTS "preferredCurrency"
    `);
  }
}
