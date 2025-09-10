/*
  Warnings:

  - The values [ROLLOVER] on the enum `TransactionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."TransactionType_new" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'PROFIT');
ALTER TABLE "public"."Transaction" ALTER COLUMN "type" TYPE "public"."TransactionType_new" USING ("type"::text::"public"."TransactionType_new");
ALTER TYPE "public"."TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "public"."TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "public"."TransactionType_old";
COMMIT;
