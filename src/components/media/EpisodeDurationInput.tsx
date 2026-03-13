import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DURATION_TEMPLATES = [10, 24, 30, 60, 120] as const;

function splitDuration(valueSeconds?: number | null) {
  if (valueSeconds == null || valueSeconds <= 0) {
    return { minutes: "", seconds: "" };
  }

  return {
    minutes: String(Math.floor(valueSeconds / 60)),
    seconds: String(valueSeconds % 60),
  };
}

function parseDurationPart(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}

interface EpisodeDurationInputProps {
  valueSeconds?: number | null;
  onChange: (value: number | undefined) => void;
}

export function EpisodeDurationInput({
  valueSeconds,
  onChange,
}: EpisodeDurationInputProps) {
  const [minutesInput, setMinutesInput] = useState("");
  const [secondsInput, setSecondsInput] = useState("");

  useEffect(() => {
    const next = splitDuration(valueSeconds);
    setMinutesInput(next.minutes);
    setSecondsInput(next.seconds);
  }, [valueSeconds]);

  const commitDuration = (nextMinutes: string, nextSeconds: string) => {
    const hasMinutes = nextMinutes.trim() !== "";
    const hasSeconds = nextSeconds.trim() !== "";

    if (!hasMinutes && !hasSeconds) {
      onChange(undefined);
      return;
    }

    const minutes = Math.max(Number.parseInt(nextMinutes || "0", 10) || 0, 0);
    const seconds = Math.min(
      Math.max(Number.parseInt(nextSeconds || "0", 10) || 0, 0),
      59,
    );

    onChange(minutes * 60 + seconds);
  };

  const previewMinutes = Math.floor((valueSeconds || 0) / 60);
  const previewSeconds = (valueSeconds || 0) % 60;
  const formattedPreview =
    valueSeconds && valueSeconds > 0
      ? `${previewMinutes}.${String(previewSeconds).padStart(2, "0")}`
      : "—";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
      <div className="space-y-1">
        <Label className="text-sm text-muted-foreground">Episode davomiyligi</Label>
        <p className="text-xs text-muted-foreground">
          Template tanlang yoki minut va sekundni qo'lda kiriting.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DURATION_TEMPLATES.map((template) => {
          const isActive = (valueSeconds || 0) === template * 60;

          return (
            <Button
              key={template}
              type="button"
              variant={isActive ? "gold" : "outline"}
              size="sm"
              onClick={() => {
                setMinutesInput(String(template));
                setSecondsInput("0");
                onChange(template * 60);
              }}
            >
              {template} min
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Minut</Label>
          <Input
            inputMode="numeric"
            value={minutesInput}
            onChange={(event) => {
              const nextMinutes = parseDurationPart(event.target.value);
              setMinutesInput(nextMinutes);
              commitDuration(nextMinutes, secondsInput);
            }}
            placeholder="22"
            className="border-border bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Sekund</Label>
          <Input
            inputMode="numeric"
            value={secondsInput}
            onChange={(event) => {
              const parsed = parseDurationPart(event.target.value);
              const normalized =
                parsed === ""
                  ? ""
                  : String(
                      Math.min(
                        Math.max(Number.parseInt(parsed || "0", 10) || 0, 0),
                        59,
                      ),
                    );

              setSecondsInput(normalized);
              commitDuration(minutesInput, normalized);
            }}
            placeholder="30"
            className="border-border bg-background"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Ko'rinish: {formattedPreview} · Jadvalga saqlanadi: {valueSeconds || 0} sek
      </p>
    </div>
  );
}
