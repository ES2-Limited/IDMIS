import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { UserPlus, MapPin, FileSpreadsheet, Droplets, GraduationCap, Sprout } from 'lucide-react';
import { Card, CardContent, Badge } from '@idmis/ui';

export function FieldCaptureView() {
  const captureForms = [
    {
      id: 'farmer',
      title: 'Farmer Registration',
      category: 'SLIS Core',
      description: '7-step survey: identity, household, location GPS, WUA group & photo docs.',
      icon: UserPlus,
      color: 'teal',
      route: '/field/capture/farmer',
    },
    {
      id: 'plot',
      title: 'Plot & Command Area Mapping',
      category: 'SLIS Core',
      description: 'Walk boundary with GPS or drop points; area computed on device.',
      icon: MapPin,
      color: 'emerald',
      route: '/field/capture/plot',
    },
    {
      id: 'water',
      title: 'Water Service Request',
      category: 'Operations',
      description: 'Record seasonal canal water allocations and delivery schedules.',
      icon: Droplets,
      color: 'blue',
      route: '/slis',
    },
    {
      id: 'fee',
      title: 'Fee Collection Receipt',
      category: 'Financials',
      description: 'Record paper receipt book reference or offline payment acknowledgment.',
      icon: FileSpreadsheet,
      color: 'amber',
      route: '/slis',
    },
    {
      id: 'training',
      title: 'Training Attendance',
      category: 'Capacity',
      description: 'Log farmer participatory irrigation management training attendance.',
      icon: GraduationCap,
      color: 'purple',
      route: '/slis',
    },
    {
      id: 'crop',
      title: 'Crop Yield Production',
      category: 'M&E Yield',
      description: 'Capture seasonal harvest yield estimates and crop varieties.',
      icon: Sprout,
      color: 'lime',
      route: '/slis',
    },
  ];

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">New Field Record</h2>
          <p className="text-xs text-slate-500">Select a field workflow to capture data offline.</p>
        </div>
        <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">
          Offline Enabled
        </Badge>
      </div>

      <div className="space-y-3">
        {captureForms.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.id} to={item.route} className="block group">
              <Card className="rounded-2xl border-slate-200/90 shadow-sm hover:border-teal-500 hover:shadow-md transition-all">
                <CardContent className="p-4 flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-teal-50 text-teal-700 group-hover:scale-105 transition-transform shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                        {item.category}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
