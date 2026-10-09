import { PrismaService } from '../src/common/prisma/prisma.service';
import { CounterpartySettlementService } from '../src/modules/settlements/counterparty-settlement.service';
import { ReconciliationService } from '../src/modules/settlements/reconciliation.service';

type CliOptions = { tenantId: string; apply: boolean };

function parseArguments(args: string[]): CliOptions {
  let tenantId = '';
  let mode: 'dry-run' | 'apply' | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (mode) throw new Error('Choose exactly one mode: --dry-run or --apply');
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
  if (!tenantId.trim()) throw new Error('Specify a tenant ID with --tenant <tenant-id>');
  return { tenantId, apply: mode === 'apply' };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      'Usage: npm run settlement:reconcile -- --tenant <tenant-id> (--dry-run | --apply)\n',
    );
    return;
  }
  const options = parseArguments(args);
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const service = new ReconciliationService(prisma, new CounterpartySettlementService());
    const report = await service.reconcileCounterpartyLedger(options.tenantId, { apply: options.apply });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (options.apply && report.exceptions.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
