export default function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-slate-950 text-white">
      {children}
    </div>
  );
}