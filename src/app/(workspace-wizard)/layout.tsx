import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WizardHeader } from "@/components/wizard-header";

export default async function WorkspaceWizardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <WizardHeader />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
