import { ApiAuthentication } from '@/lib/types/api-documentation';
import { CodeBlock } from './code-block';
import { Badge } from '@/components/ui/badge';
import { Shield, Key, Lock } from 'lucide-react';

interface AuthenticationInfoProps {
  auth?: ApiAuthentication;
  showExample?: boolean;
}

const AUTH_TYPE_ICONS = {
  bearer: Shield,
  'api-key': Key,
  oauth2: Lock,
  basic: Lock,
};

const AUTH_TYPE_LABELS = {
  bearer: 'Bearer Token',
  'api-key': 'API Key',
  oauth2: 'OAuth 2.0',
  basic: 'Basic Auth',
};

export function AuthenticationInfo({
  auth,
  showExample = true,
}: AuthenticationInfoProps) {
  if (!auth) {
    return (
      <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            No Authentication Required
          </Badge>
          <p className="text-sm text-muted-foreground">
            This endpoint is publicly accessible
          </p>
        </div>
      </div>
    );
  }

  const Icon = AUTH_TYPE_ICONS[auth.type];
  const typeLabel = AUTH_TYPE_LABELS[auth.type];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h4 className="text-sm font-semibold">{typeLabel}</h4>
        </div>
        <Badge variant="secondary" className="text-xs">
          Required
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{auth.description}</p>

      {auth.headerName && (
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Header Name
          </div>
          <code className="text-sm font-mono">{auth.headerName}</code>
        </div>
      )}

      {auth.scopes && auth.scopes.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Required Scopes
          </div>
          <div className="flex flex-wrap gap-2">
            {auth.scopes.map((scope, index) => (
              <Badge key={index} variant="outline" className="font-mono text-xs">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {showExample && auth.example && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Example Header
          </div>
          <CodeBlock
            code={`${auth.headerName || 'Authorization'}: ${auth.example}`}
            language="bash"
            maxHeight="100px"
          />
        </div>
      )}
    </div>
  );
}
