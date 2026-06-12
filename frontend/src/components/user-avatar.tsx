/**
 * Single-source-of-truth avatar renderer.
 *
 * Anywhere in the app that needs to show a user's avatar — header pill,
 * profile page, onboarding preview — goes through this component so the
 * three render modes (uploaded image / preset emoji / initials fallback)
 * stay consistent and any future change to e.g. ring/border behavior
 * happens in exactly one place.
 */
import { parseAvatar } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export type UserAvatarSize = "sm" | "md" | "lg" | "xl";

type Props = {
  /** Raw picture string from UserProfile.picture. Pass empty/undefined
   * to render the initials fallback. */
  picture?: string | null;
  /** Initials shown when no picture is set, e.g. "JS". Generated from
   * first + last name elsewhere. */
  initials: string;
  /** T-shirt size mapping to consistent pixel diameters across the app. */
  size?: UserAvatarSize;
  className?: string;
};

const SIZE_CLASSES: Record<UserAvatarSize, { box: string; emoji: string; initials: string }> = {
  // h-9 keeps parity with the header buttons.
  sm: { box: "h-9 w-9", emoji: "text-lg", initials: "text-xs" },
  md: { box: "h-12 w-12", emoji: "text-2xl", initials: "text-sm" },
  lg: { box: "h-16 w-16", emoji: "text-3xl", initials: "text-base" },
  xl: { box: "h-24 w-24", emoji: "text-5xl", initials: "text-xl" },
};

export function UserAvatar({ picture, initials, size = "sm", className }: Props) {
  const kind = parseAvatar(picture);
  const sz = SIZE_CLASSES[size];

  if (kind.kind === "image") {
    return (
      <span
        className={cn(
          "flex shrink-0 overflow-hidden rounded-full bg-muted",
          sz.box,
          className,
        )}
      >
        <img
          src={kind.src}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      </span>
    );
  }

  if (kind.kind === "preset") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          sz.box,
          sz.emoji,
          kind.preset.bg,
          className,
        )}
        aria-label={kind.preset.label}
      >
        {/* Emoji centered via line-height tweak — some emoji glyphs sit
            slightly above the typographic baseline, this brings them
            back into the circle. */}
        <span className="leading-none">{kind.preset.emoji}</span>
      </span>
    );
  }

  // Fallback: initials in a tinted circle, matching the previous header
  // avatar styling so users who haven't picked an avatar yet don't see
  // any visual regression.
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        sz.box,
        sz.initials,
        className,
      )}
    >
      {initials || "—"}
    </span>
  );
}
