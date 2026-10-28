"use client";

import { useState } from "react";

type Option = { id: string; name: string; element: string };

const label = (c: Option) => `${c.name} (${c.element})`;

// A missing icon shouldn't leave a broken-image box
const Icon = ({ id, size }: { id: string; size: number }) => (
  <img
    src={`/icons/${id}.webp`}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
  />
);

// Searchable character list with icons; type to filter by name or element, arrows + Enter to pick
export default function CharacterPicker({
  characters,
  value,
  onChange,
}: {
  characters: Option[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = characters.find((c) => c.id === value);
  const q = query.trim().toLowerCase();
  const matches = characters.filter((c) => label(c).toLowerCase().includes(q));

  const pick = (c: Option) => {
    onChange(c.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <span className="picker">
      {current && <Icon key={current.id} id={current.id} size={32} />}
      <input
        role="combobox"
        aria-label="Character"
        aria-expanded={open}
        aria-controls="character-list"
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `character-${matches[active].id}` : undefined}
        placeholder="Search character"
        value={open ? query : current ? label(current) : ""}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.currentTarget.blur();
          }
        }}
      />
      {open && (
        <ul id="character-list" role="listbox">
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`character-${c.id}`}
              role="option"
              aria-selected={c.id === value}
              className={i === active ? "active" : undefined}
              // mousedown, not click: the input's blur would close the list before a click lands
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
                (document.activeElement as HTMLElement | null)?.blur();
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Icon id={c.id} size={24} /> {label(c)}
            </li>
          ))}
          {matches.length === 0 && <li>No match</li>}
        </ul>
      )}
    </span>
  );
}
