import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WizardHeader } from "@/components/wizard-header";

export default async function CloudInstanceWizardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <WizardHeader title="弹性规格" />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
