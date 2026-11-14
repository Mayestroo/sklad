import { PrismaService } from '../src/common/prisma/prisma.service';
import { AccountsService } from '../src/modules/accounting/accounts/accounts.service';
import { JournalService } from '../src/modules/accounting/journal/journal.service';
import { FinanceService } from '../src/modules/finance/finance.service';
import { CounterpartySettlementService } from '../src/modules/settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../src/modules/settlements/settlement-allocation.service';

/**
 * Posts the journal entries missing from Finance transactions recorded before
 * Finance posted journals (ADR 0006). --dry-run rolls every posting back and
 * reports what --apply would post, including rows in closed periods.
 */
type CliOptions = { tenantId: string; apply: boolean };

function parseArguments(args: string[]): CliOptions {
  let tenantId = '';
  let mode: 'dry-run' | 'apply' | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (mode)
        throw new Error('Choose exactly one mode: --dry-run or --apply');
      mode = arg === '--apply' ? 'apply' : 'dry-run';
      continue;
    }
    if (arg === '--tenant') {
      tenantId = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--tenant=')) {
      tenantId = arg.slice('--tenant='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!mode) throw new Error('Specify exactly one mode: --dry-run or --apply');
  if (!tenantId.trim())
    throw new Error('Specify a tenant ID with --tenant <tenant-id>');
  return { tenantId, apply: mode === 'apply' };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      'Usage: npm run finance:backfill-journal -- --tenant <tenant-id> (--dry-run | --apply)\n',
    );
    return;
  }
  const options = parseArguments(args);
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const accounts = new AccountsService(prisma);
    const service = new FinanceService(
      prisma,
      new CounterpartySettlementService(),
      new SettlementAllocationService(),
      new JournalService(prisma, accounts),
      accounts,
    );
    const report = await service.backfillJournalEntries(options.tenantId, {
      apply: options.apply,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.failures.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
