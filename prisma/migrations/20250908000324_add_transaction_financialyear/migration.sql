/*
  Warnings:

  - You are about to drop the column `periodName` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `Transaction` table. All the data in the column will be lost.
  - Changed the type of `type` on the `Transaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'ROLLOVER');

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "periodName",
DROP COLUMN "year",
DROP COLUMN "type",
ADD COLUMN     "type" "public"."TransactionType" NOT NULL;
