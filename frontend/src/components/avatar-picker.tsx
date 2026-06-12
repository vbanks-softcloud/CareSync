/**
 * Avatar picker.
 *
 * Standalone block the onboarding + profile screens both drop in. It owns
 * its own preview UI; the parent just receives `onChange(picture)` with
 * the value to persist (a "preset:<id>" string or a base64 data URL).
 *
 * Two ways to set the avatar:
 *   1. Click "Choose avatar" → opens a dialog with the preset grid.
 *   2. Inside the dialog: "Upload your own" → file picker → client-side
 *      resize down to a sub-2KB JPEG → preview, save on confirm.
 *
 * The resize logic lives in @/lib/avatar so it can be unit-tested
 * independently. Errors from the resize loop (e.g. "image too detailed
 * to compress this small") surface inline in the dialog.
 */
import { useState } from "react";
import { Loader2, Pencil, Upload, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { AVATAR_PRESETS, resizeImageForAvatar } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type Props = {
  /** Current picture value (same shape as UserProfile.picture). */
  value: string;
  /** Fired with the new value. Empty string means "clear my avatar". */
  onChange: (next: string) => void;
  /** Initials shown when no avatar is set yet, so the preview circle
   * isn't empty before the user has picked anything. */
  initials: string;
};

export function AvatarPicker({ value, onChange, initials }: Props) {
  const [open, setOpen] = useState(false);
  // Drafts live in dialog-local state so the user can preview a preset
  // or new upload without committing it until they hit Save. Hitting
  // Cancel (or ESC) discards the draft and the underlying profile value
  // is untouched.
  const [draft, setDraft] = useState<string>(value);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const openDialog = () => {
    setDraft(value);
    setUploadError(null);
    setOpen(true);
  };

  const cancel = () => setOpen(false);

  const save = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice in a row still
    // triggers onChange.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("That doesn't look like an image. Pick a JPG, PNG, or GIF.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const dataUrl = await resizeImageForAvatar(file);
      setDraft(dataUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't process that image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <UserAvatar picture={value} initials={initials} size="xl" />
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={openDialog} className="gap-1.5">
          <Pencil className="h-4 w-4" />
          {value ? "Change avatar" : "Choose avatar"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pick your avatar</DialogTitle>
            <DialogDescription>
              Choose one of the preset avatars, or upload your own photo.
              Uploads are resized and stored privately on your account.
            </DialogDescription>
          </DialogHeader>

          {/* Live preview of the draft so the user sees exactly what
              they'll save before committing. */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <UserAvatar picture={draft} initials={initials} size="lg" />
            <div className="text-sm">
              <div className="font-medium">Preview</div>
              <div className="text-xs text-muted-foreground">
                {draft.startsWith("data:")
                  ? "Your uploaded photo"
                  : draft.startsWith("preset:")
                    ? "Preset avatar"
                    : "Initials (no avatar set)"}
              </div>
            </div>
          </div>

          {/* Preset grid. Selecting an option just updates the draft —
              nothing is persisted until Save. */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Presets
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {AVATAR_PRESETS.map((preset) => {
                const id = `preset:${preset.id}`;
                const selected = draft === id;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => setDraft(id)}
                    className={cn(
                      "relative flex h-12 w-12 items-center justify-center rounded-full text-2xl transition",
                      preset.bg,
                      selected
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:scale-110 hover:shadow-sm",
                    )}
                    aria-label={preset.label}
                    title={preset.label}
                    aria-pressed={selected}
                  >
                    <span className="leading-none">{preset.emoji}</span>
                    {selected && (
                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload control. The file input is visually hidden behind a
              styled label so we can keep our Button look without losing
              the native file picker. */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Or upload your own
            </div>
            <label
              htmlFor="avatar-upload"
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-accent",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Resizing…" : "Upload photo"}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFile}
              className="sr-only"
            />
            {uploadError && (
              <p className="mt-2 text-xs text-destructive">{uploadError}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              We resize uploads to a small square so they save to your account
              quickly. For best results pick a photo where your face is
              centered.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save avatar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
