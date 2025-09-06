/*
  Warnings:

  - You are about to drop the column `profit` on the `investors` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `investors` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `investors` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `investors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `investors` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."YearlyProfitDistribution" DROP CONSTRAINT "YearlyProfitDistribution_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."investors" DROP CONSTRAINT "investors_userId_fkey";

-- DropIndex
DROP INDEX "public"."investors_userId_key";

-- AlterTable
ALTER TABLE "public"."investors" DROP COLUMN "profit",
DROP COLUMN "userId",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "fullName" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "investors_email_key" ON "public"."investors"("email");

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YearlyProfitDistribution" ADD CONSTRAINT "YearlyProfitDistribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
