export default function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-[#0a0a0a] text-white">
      {children}
    </div>
  );
}