import { MinimalHeader } from "@/components/MinimalHeader";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MinimalHeader />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
