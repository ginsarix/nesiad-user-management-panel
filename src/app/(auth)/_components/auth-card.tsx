export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Info or error box at the top of an auth form */
export function AuthNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground"
      }
    >
      {children}
    </p>
  );
}
