/*
  Warnings:

  - You are about to drop the column `userName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `investors` table. All the data in the column will be lost.
  - You are about to drop the column `userName` on the `investors` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phone]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `investors` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `phone` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `investors` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."investors" DROP CONSTRAINT "investors_userName_fkey";

-- DropIndex
DROP INDEX "public"."User_userName_key";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "userName",
ADD COLUMN     "phone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."investors" DROP COLUMN "phone",
DROP COLUMN "userName",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "investors_userId_key" ON "public"."investors"("userId");

-- AddForeignKey
ALTER TABLE "public"."investors" ADD CONSTRAINT "investors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
