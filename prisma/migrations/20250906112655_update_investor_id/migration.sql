/*
  Warnings:

  - You are about to drop the column `userId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `YearlyProfitDistribution` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[financialYearId,investorId]` on the table `YearlyProfitDistribution` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `investorId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `investorId` to the `YearlyProfitDistribution` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."YearlyProfitDistribution" DROP CONSTRAINT "YearlyProfitDistribution_userId_fkey";

-- DropIndex
DROP INDEX "public"."YearlyProfitDistribution_financialYearId_userId_key";

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "userId",
ADD COLUMN     "investorId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."YearlyProfitDistribution" DROP COLUMN "userId",
ADD COLUMN     "investorId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "YearlyProfitDistribution_financialYearId_investorId_key" ON "public"."YearlyProfitDistribution"("financialYearId", "investorId");

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "public"."investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YearlyProfitDistribution" ADD CONSTRAINT "YearlyProfitDistribution_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "public"."investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
