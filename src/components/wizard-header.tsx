"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface WizardHeaderProps {
  title?: string;
}

export function WizardHeader({ title = "新建工作区" }: WizardHeaderProps) {
  const router = useRouter();

  return (
    <header className="border-b bg-white shrink-0">
      <div className="container mx-auto px-4 h-16 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-lg font-semibold">
            MeterSpace
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">{title}</span>
        </div>
      </div>
    </header>
  );
}
