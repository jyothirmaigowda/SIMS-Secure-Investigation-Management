import React from 'react';
import {
  UserCheck,
  Shield,
  Building2,
  Lock,
  Award,
  KeyRound,
  FileCheck
} from 'lucide-react';
import { User } from '../../types.ts';

interface ProfileViewProps {
  currentUser: User;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ currentUser }) => {
  const getRolePermissions = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return [
          'Full institutional configuration management',
          'System-wide audit trail inspection',
          'Jurisdictional boundary override',
          'Administrative user credential management',
        ];
      case 'SUPERVISOR':
        return [
          'Case disposition assignment (Approve, Indictment Ready, Close)',
          'Supervisory case review submission and sign-off',
          'Review warrant applications and affidavits',
          'Full write and transfer authority within jurisdiction',
        ];
      case 'LEGAL':
        return [
          'Grand jury and legal compliance evaluations',
          'Statutory deficiency flagging and formal legal memo sign-off',
          'Prosecution readiness index audit',
          'Case discovery review clearance',
        ];
      case 'IO':
      default:
        return [
          'Case creation and investigative notes authoring',
          'Seize and register evidence with SHA-256 computation',
          'Execute chain of custody transfers',
          'Draft warrant applications and interrogation transcripts',
          'Log forensic timeline events',
        ];
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-blue-600" />
          Officer Credential & Security Profile
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Active identity, credential verification, and effective role-based access control clearance.
        </p>
      </div>

      {/* Identity Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 border border-blue-700 flex items-center justify-center shadow-md">
              <Shield className="w-8 h-8 text-white fill-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {currentUser.role}
                </span>
                <span className="text-xs font-mono text-slate-500">Badge #{currentUser.badge_number}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 font-serif">{currentUser.full_name}</h2>
              <p className="text-xs text-slate-500 font-mono">{currentUser.email}</p>
            </div>
          </div>

          <div className="text-right font-mono text-xs text-slate-500">
            <div className="flex items-center gap-1.5 justify-end text-emerald-700 font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>httpOnly Session Active</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Bcrypt Salted Credential</p>
          </div>
        </div>

        {/* Security Clearances */}
        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 block">Assigned Jurisdiction</span>
            <span className="text-slate-900 font-bold text-sm">{currentUser.jurisdiction}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 block">Sensitivity Clearance</span>
            <span className="text-blue-700 font-bold text-sm">
              {currentUser.role === 'ADMIN' ? 'TOP SECRET / RESTRICTED' : 'CONFIDENTIAL / SECRET'}
            </span>
          </div>
        </div>

        {/* Effective Policy Permissions */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
            Effective Institutional Authorizations:
          </h3>
          <div className="space-y-2">
            {getRolePermissions(currentUser.role).map((perm, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5"
              >
                <Award className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{perm}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
