/*
  Warnings:

  - The values [AMOUNT] on the enum `WithdrawSource` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."WithdrawSource_new" AS ENUM ('AMOUNT_ROLLOVER', 'ROLLOVER');
ALTER TABLE "public"."Transaction" ALTER COLUMN "withdrawSource" TYPE "public"."WithdrawSource_new" USING ("withdrawSource"::text::"public"."WithdrawSource_new");
ALTER TYPE "public"."WithdrawSource" RENAME TO "WithdrawSource_old";
ALTER TYPE "public"."WithdrawSource_new" RENAME TO "WithdrawSource";
DROP TYPE "public"."WithdrawSource_old";
COMMIT;
