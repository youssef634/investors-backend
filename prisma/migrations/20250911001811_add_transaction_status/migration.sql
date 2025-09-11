-- CreateEnum
CREATE TYPE "public"."TransactionStatus" AS ENUM ('PENDING', 'CANCELED');

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "status" "public"."TransactionStatus" NOT NULL DEFAULT 'PENDING';
