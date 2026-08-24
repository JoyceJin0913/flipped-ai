/**
 * 心动岛 · 共享 UI 原子组件
 * 严格沿用 Lovable 设计系统：glass-card / bg-romance / shadow-glow / max-w-md
 */

import { Heart, Home, User, ChevronLeft } from "lucide-react";
import type { RelationshipStage, AttachmentType, IntentType } from "./types";

// ============================================================
// 阶段/ 依恋 文案映射
// ============================================================

export const STAGE_LABELS: Record<RelationshipStage, string> = {
  stranger: "陌生",
  icebreak: "破冰",
  flirt: "暧昧",
  crush: "心动",
};

export const ATTACHMENT_LABELS: Record<AttachmentType, string> = {
  secure: "安全型",
  anxious: "焦虑型",
  avoidant: "回避型",
};

export const ATTACHMENT_DESC: Record<AttachmentType, string> = {
  secure: "能自在地靠近，也能坦然独处。冲突时愿意沟通。",
  anxious: "渴望亲密与确认，害怕被忽略。情绪易受对方影响。",
  avoidant: "重视自我空间，靠近时容易先想退路。习惯用理性保护自己。",
};

export const INTENT_ICONS: Record<IntentType, string> = {
  probe: "?",
  advance: "+",
  soothe: "~",
  humor: "!",
  adventure: ">",
};

export const TIER_LABELS: Record<string, string> = {
  high_affinity: "高契合",
  contrast: "反差吸引",
  red_flag: "雷区预警",
  filler: "普通缘分",
};

export const TIER_STYLES: Record<string, string> = {
  high_affinity: "bg-primary/15 text-primary border-primary/30",
  contrast: "bg-accent/15 text-accent-foreground border-accent/30",
  red_flag: "bg-destructive/15 text-destructive border-destructive/30",
  filler: "bg-muted/40 text-muted-foreground border-border",
};

// ============================================================
// 原子组件
// ============================================================

/** 顶部标题栏（Lovable 风格：居中大标题 + 0.3em 宽字距） */
export function TopBar({
  title,
  subtitle,
  time,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  time?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <header className="relative px-5 pt-8 text-center">
      {onBack && (
        <button
          onClick={onBack}
          className="absolute left-4 top-8 flex size-8 items-center justify-center rounded-full glass-card text-foreground transition-transform active:scale-95"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {right && <div className="absolute right-4 top-8">{right}</div>}
      <h1
        className={`font-semibold text-primary ${
          title.length > 4 ? "text-2xl tracking-[0.18em]" : "text-3xl tracking-[0.3em]"
        }`}
      >
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      {time && <p className="mt-1 text-[11px] tracking-[0.3em] text-muted-foreground">{time}</p>}
    </header>
  );
}

/** 主行动按钮（渐变） */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-full bg-romance py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}

/** 次级按钮 */
export function GhostButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-full border border-border py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 active:scale-[0.98] disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/** 心动值进度条 */
export function HeartBar({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="bg-romance h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {value}
        </span>
      )}
    </div>
  );
}

/** 头像圆片（首字 + 性别色） */
export function Avatar({
  name,
  gender,
  size = "md",
  ring,
}: {
  name: string;
  gender: "male" | "female";
  size?: "sm" | "md" | "lg" | "xl";
  ring?: boolean;
}) {
  const sizes = {
    sm: "size-9 text-sm",
    md: "size-12 text-base",
    lg: "size-16 text-xl",
    xl: "size-24 text-3xl",
  };
  const tone =
    gender === "male"
      ? "border border-male/40 bg-male/10 text-male"
      : "border border-female/40 bg-female/10 text-female";
  return (
    <div
      className={`${sizes[size]} ${tone} flex shrink-0 items-center justify-center rounded-full font-semibold ${
        ring ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background" : ""
      }`}
    >
      {name.slice(0, 1)}
    </div>
  );
}

/** 小标签 */
export function Chip({
  children,
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "default" | "primary" | "danger" | "male" | "female";
  className?: string;
}) {
  const tones = {
    default: "bg-secondary/60 text-muted-foreground border-border",
    primary: "bg-primary/15 text-primary border-primary/30",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
    male: "border-male/40 bg-male/10 text-male",
    female: "border-female/40 bg-female/10 text-female",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** 底部抽屉（对齐 Lovable HouseApp MemberSheet/ChatSheet 结构） */
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="animate-fade-in relative mx-auto max-h-[86vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 pb-28">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        {children}
      </div>
    </div>
  );
}

/** 三 Tab 底部导航（对齐 Lovable HouseApp TabBar） */
export function TabBar({
  active,
  onChange,
}: {
  active: "house" | "relationships" | "me";
  onChange: (t: "house" | "relationships" | "me") => void;
}) {
  const items = [
    { key: "house" as const, icon: Home, label: "小屋" },
    { key: "relationships" as const, icon: Heart, label: "心动观察" },
    { key: "me" as const, icon: User, label: "我的 · 沉淀故事" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/90 backdrop-blur">
      <ul className="flex items-stretch justify-around px-2 py-2">
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <li key={it.key}>
              <button
                onClick={() => onChange(it.key)}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <it.icon className="size-5" />
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 空态*/
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Heart className="size-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

/** 分区标题 */
export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
