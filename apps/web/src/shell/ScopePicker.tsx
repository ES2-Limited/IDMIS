import * as React from 'react';
import { useScope } from './ScopeContext';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@idmis/ui';
import { MapPin } from 'lucide-react';

export function ScopePicker() {
  const { currentScope, setScope, availableScopes } = useScope();

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 text-slate-500 shrink-0" aria-hidden="true" />
      <Select
        value={currentScope.id}
        onValueChange={(val: string) => {
          const match = availableScopes.find((s) => s.id === val);
          if (match) setScope(match);
        }}
      >
        <SelectTrigger
          aria-label="Filter scope"
          className="h-9 min-h-[36px] w-[220px] bg-white border-slate-300 text-xs font-medium"
        >
          <SelectValue placeholder="Select Scope" />
        </SelectTrigger>
        <SelectContent>
          {availableScopes.map((scope) => (
            <SelectItem key={scope.id} value={scope.id}>
              {scope.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
