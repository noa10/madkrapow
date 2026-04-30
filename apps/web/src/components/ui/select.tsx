"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------- Context ---------- */

interface SelectContextValue {
  value?: string;
  onValueChange?: (v: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  content?: React.ReactNode;
  setContent?: (children: React.ReactNode) => void;
}

const SelectContext = React.createContext<SelectContextValue>({});

const useSelectContext = () => React.useContext(SelectContext);

/* ---------- Select (Context Provider) ---------- */

interface SelectProps {
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
}

const Select: React.FC<SelectProps> = ({
  children,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  required,
}) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const [content, setContent] = React.useState<React.ReactNode>(null);

  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (!controlled) setInternalValue(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange]
  );

  return (
    <SelectContext.Provider
      value={{
        value: currentValue,
        onValueChange: handleValueChange,
        name,
        disabled,
        required,
        content,
        setContent,
      }}
    >
      {children}
    </SelectContext.Provider>
  );
};

/* ---------- SelectTrigger (renders the actual <select>) ---------- */

interface SelectTriggerProps {
  children?: React.ReactNode;
  placeholder?: string;
  className?: string;
}

const SelectTrigger = React.forwardRef<HTMLSelectElement, SelectTriggerProps>(
  ({ className, children, placeholder }, ref) => {
    const { value, onValueChange, name, disabled, required, content } = useSelectContext();

    return (
      <div className="relative">
        <select
          ref={ref}
          name={name}
          disabled={disabled}
          required={required}
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 pr-8 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
            className
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
          {content}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger";

/* ---------- SelectValue ---------- */

const SelectValue = ({ children, placeholder }: { children?: React.ReactNode; placeholder?: string }) => {
  return <>{placeholder ?? children}</>;
};

/* ---------- SelectContent (stashes children into context for SelectTrigger to render) ---------- */

const SelectContent = ({ children, className: _className }: { children?: React.ReactNode; className?: string }) => {
  const { setContent } = useSelectContext();

  React.useLayoutEffect(() => {
    setContent?.(children);
  });

  return null;
};
SelectContent.displayName = "SelectContent";

/* ---------- SelectItem ---------- */

interface SelectItemProps extends React.OptionHTMLAttributes<HTMLOptionElement> {
  children?: React.ReactNode;
}

const SelectItem = React.forwardRef<HTMLOptionElement, SelectItemProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <option ref={ref} className={cn(className)} {...props}>
        {children}
      </option>
    );
  }
);
SelectItem.displayName = "SelectItem";

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };