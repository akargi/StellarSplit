import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultiCurrencyService } from './multi-currency.service';
import { ExchangeRateTrackerService } from './exchange-rate-tracker.service';
import { PathPaymentService } from './path-payment.service';
import { MultiCurrencyPayment } from './entities/multi-currency-payment.entity';
import { Payment } from '../entities/payment.entity';
import { Split } from '../entities/split.entity';
import { Participant } from '../entities/participant.entity';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MultiCurrencyPayment,
      Payment,
      Split,
      Participant,
    ]),
    StellarModule,
  ],
  providers: [
    MultiCurrencyService,
    ExchangeRateTrackerService,
    PathPaymentService,
  ],
  exports: [
    MultiCurrencyService,
    ExchangeRateTrackerService,
    PathPaymentService,
  ],
})
export class MultiCurrencyModule {}
