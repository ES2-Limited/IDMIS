import * as React from 'react';
import { useScope } from './ScopeContext';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@idmis/ui';
import { MapPin } from 'lucide-react';

export function ScopePicker() {
  const { currentScope, setScope, availableScopes } = useScope();

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={currentScope.id}
        onValueChange={(val: string) => {
          const match = availableScopes.find((s) => s.id === val);
          if (match) setScope(match);
        }}
      >
        <SelectTrigger
          aria-label="Filter scope"
          className="h-8.5 min-h-[34px] w-[140px] sm:w-[180px] md:w-[220px] bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:bg-white hover:border-teal-600 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 text-teal-700 shrink-0" aria-hidden="true" />
            <SelectValue placeholder="Select Scope" />
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-xl border-slate-200">
          {availableScopes.map((scope) => (
            <SelectItem key={scope.id} value={scope.id} className="text-xs font-medium py-2">
              {scope.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
