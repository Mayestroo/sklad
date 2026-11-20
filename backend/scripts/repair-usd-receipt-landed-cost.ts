/**
 * Restores the receipt-currency landed cost of USD receipt lines that an old
 * Additional Expense posting overwrote with a UZS figure. Dry run unless
 * --apply is passed; each tenant is planned and written in its own
 * transaction. Lines whose correct value cannot be derived exactly are listed
 * as MANUAL REVIEW and never written.
 *
 *   npm run purchases:repair-usd-landed-cost                 # all tenants, dry run
 *   npm run purchases:repair-usd-landed-cost -- --tenant <id>
 *   npm run purchases:repair-usd-landed-cost -- --tenant <id> --apply
 */
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  formatRepairLine,
  repairUsdReceiptLandedCost,
} from '../src/modules/purchases/usd-receipt-landed-cost-repair';

type CliOptions = { tenantIds: string[]; apply: boolean };

function parseArguments(args: string[]): CliOptions {
  const tenantIds: string[] = [];
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--tenant') {
      const id = args[index + 1];
      if (!id) throw new Error('--tenant needs a tenant ID');
      tenantIds.push(id);
      index += 1;
    } else if (arg.startsWith('--tenant=')) {
      tenantIds.push(arg.slice('--tenant='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { tenantIds, apply };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      'Usage: npm run purchases:repair-usd-landed-cost -- [--tenant <id>]... [--apply]\n',
    );
    return;
  }
  const options = parseArguments(args);
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const tenantIds =
      options.tenantIds.length > 0
        ? options.tenantIds
        : (
            await prisma.company.findMany({
              select: { id: true },
              orderBy: { createdAt: 'asc' },
            })
          ).map((c) => c.id);

    process.stdout.write(
      options.apply
        ? 'Mode: APPLY (writes)\n'
        : 'Mode: dry run (no writes; pass --apply to write)\n',
    );
    let manual = 0;
    for (const tenantId of tenantIds) {
      const report = await repairUsdReceiptLandedCost(prisma, tenantId, {
        apply: options.apply,
      });
      if (report.lines.length === 0) continue;
      process.stdout.write(`\nTenant ${tenantId}\n`);
      for (const line of report.lines) {
        process.stdout.write(`  ${formatRepairLine(line)}\n`);
      }
      const toRepair = report.lines.filter((l) => l.status === 'repair').length;
      manual += report.lines.length - toRepair;
      process.stdout.write(
        `  ${toRepair} to repair, ${report.lines.length - toRepair} manual review, ${report.written} written\n`,
      );
    }
    if (manual > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
