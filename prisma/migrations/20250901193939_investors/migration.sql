/*
  Warnings:

  - You are about to drop the `Contribution` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Contribution" DROP CONSTRAINT "Contribution_userName_fkey";

-- DropTable
DROP TABLE "public"."Contribution";

-- CreateTable
CREATE TABLE "public"."investors" (
    "id" SERIAL NOT NULL,
    "userName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."investors" ADD CONSTRAINT "investors_userName_fkey" FOREIGN KEY ("userName") REFERENCES "public"."User"("userName") ON DELETE RESTRICT ON UPDATE CASCADE;
