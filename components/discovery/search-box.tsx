'use client'

import { SearchIcon, XIcon } from 'lucide-react'
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Input } from '@/components/ui/input'
import { StatusPin, type PinState } from '@/components/status-pin'
import { searchBeaches, type SearchHit } from '@/lib/search'
import type { Beach } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

export interface SearchBoxProps {
  beaches: readonly Beach[]
  status: Readonly<Record<string, PinState | undefined>>
  /** Same callback the map's pins and the list's rows call. Never navigates. */
  onSelect: (id: string) => void
  placeholder?: string
  /** Default 8. */
  maxResults?: number
  autoFocus?: boolean
  className?: string
}

const FIELD_LABEL: Record<SearchHit['field'], string> = {
  name: '',
  waterBody: 'on',
  community: 'in',
  lake: 'lake',
}

/**
 * A combobox over the roster. Picking a result calls `onSelect(id)`, clears the
 * query and closes the list; the camera move and the URL are the caller's job.
 */
export function SearchBox({
  beaches,
  status,
  onSelect,
  placeholder,
  maxResults = 8,
  autoFocus = false,
  className,
}: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const hits = useMemo(() => searchBeaches(query, beaches, { limit: maxResults }), [query, beaches, maxResults])
  const showList = open && query.trim().length > 0

  function pick(id: string) {
    onSelect(id)
    setQuery('')
    setOpen(false)
    setActive(0)
    inputRef.current?.blur()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hits[active]) pick(hits[active].beach.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div data-slot="search-box" className={cn('relative', className)}>
      <div className="flex h-11 items-center gap-2 rounded-xl bg-white/92 pl-3 pr-1.5 shadow-lg backdrop-blur-sm">
        <SearchIcon className="size-4 shrink-0 text-neutral-500" aria-hidden />
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && hits[active] ? `${listId}-${hits[active].beach.id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="search"
          placeholder={placeholder ?? `Search ${beaches.length} monitored beaches`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()} // keep focus on the input
            onClick={() => {
              setQuery('')
              setActive(0)
            }}
            className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching beaches"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl bg-white/95 p-1 shadow-lg backdrop-blur-sm"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-neutral-500" aria-live="polite">
              No beaches match “{query.trim()}”
            </li>
          ) : (
            hits.map((hit, i) => {
              const state = status[hit.beach.id] ?? 'unknown'
              return (
                <li
                  key={hit.beach.id}
                  id={`${listId}-${hit.beach.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-beach-id={hit.beach.id}
                  onMouseDown={(e) => e.preventDefault()} // fire before blur closes the list
                  onClick={() => pick(hit.beach.id)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm',
                    i === active && 'bg-neutral-100',
                  )}
                >
                  <StatusPin state={state} hollow={hit.beach.authority === 'province'} className="size-3 border-[2.5px] shadow-none transition-none" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-900">{hit.beach.name}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {hit.field === 'name'
                        ? hit.beach.waterBody
                        : `${FIELD_LABEL[hit.field]} ${hit.matched}`.trim()}
                    </span>
                  </span>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
