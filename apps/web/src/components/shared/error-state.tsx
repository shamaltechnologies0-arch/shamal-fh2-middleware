import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ErrorStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  action,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <Alert variant="destructive" className="max-w-md text-left">
        <AlertCircle />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      {action}
    </div>
  );
}
