-- AlterTable
ALTER TABLE "public"."investors" ALTER COLUMN "amount" SET DEFAULT 0,
ALTER COLUMN "phone" DROP NOT NULL;
