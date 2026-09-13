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
    <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.back()}
          className="-ml-1 shrink-0"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <Link href="/" className="font-medium">
            MeterSpace
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="truncate text-muted-foreground">{title}</span>
        </div>
      </div>
    </header>
  );
}
