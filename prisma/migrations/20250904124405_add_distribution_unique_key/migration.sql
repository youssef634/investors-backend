/*
  Warnings:

  - A unique constraint covering the columns `[financialYearId,userId]` on the table `YearlyProfitDistribution` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "YearlyProfitDistribution_financialYearId_userId_key" ON "public"."YearlyProfitDistribution"("financialYearId", "userId");
