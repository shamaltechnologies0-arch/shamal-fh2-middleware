import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/developer/copy-button";
import { cn } from "@/lib/utils";

export type CodeSnippetLanguage = "curl" | "node" | "python" | "json" | string;

type CodeSnippetProps = {
  snippets: Partial<Record<CodeSnippetLanguage, string>>;
  defaultLanguage?: CodeSnippetLanguage;
  label?: string;
  filename?: string;
  wrap?: boolean;
  className?: string;
};

const languageLabels: Record<string, string> = {
  curl: "cURL",
  node: "Node.js",
  python: "Python",
  json: "JSON",
};

export function CodeSnippet({
  snippets,
  defaultLanguage,
  label,
  filename,
  wrap = false,
  className,
}: CodeSnippetProps) {
  const entries = Object.entries(snippets).filter(([, code]) => Boolean(code?.trim()));
  const [active, setActive] = useState(defaultLanguage ?? entries[0]?.[0] ?? "curl");

  if (!entries.length) return null;

  const current = snippets[active] ?? "";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-[var(--cc-surface-secondary)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          {label ? <p className="truncate text-xs font-medium text-foreground">{label}</p> : null}
          {filename ? (
            <p className="truncate font-mono-telemetry text-[11px] text-muted-foreground">
              {filename}
            </p>
          ) : null}
        </div>
        <CopyButton value={current} label="Copy snippet" size="sm" />
      </div>

      <Tabs value={active} onValueChange={setActive}>
        {entries.length > 1 ? (
          <TabsList
            variant="line"
            className="h-9 w-full justify-start rounded-none border-b border-border/60 bg-transparent px-2"
          >
            {entries.map(([lang]) => (
              <TabsTrigger key={lang} value={lang} className="text-xs">
                {languageLabels[lang] ?? lang}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}

        {entries.map(([lang, code]) => (
          <TabsContent key={lang} value={lang} className="m-0">
            <ScrollArea className="max-h-64">
              <pre
                className={cn(
                  "p-3 font-mono-telemetry text-xs leading-relaxed text-foreground/90",
                  wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre",
                )}
              >
                <code>{code}</code>
              </pre>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
