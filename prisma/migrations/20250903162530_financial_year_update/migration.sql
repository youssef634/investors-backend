/*
  Warnings:

  - Added the required column `dailyProfit` to the `YearlyProfitDistribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `daysSoFar` to the `YearlyProfitDistribution` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."YearlyProfitDistribution" ADD COLUMN     "dailyProfit" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "daysSoFar" INTEGER NOT NULL;
