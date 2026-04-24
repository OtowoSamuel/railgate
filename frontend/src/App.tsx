import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeployments, createDeployment } from './api';
import { Rocket, Github, Upload, Loader2, ExternalLink, ScrollText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function App() {
  const queryClient = useQueryClient();
  const [gitUrl, setGitUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: getDeployments,
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: createDeployment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setGitUrl('');
      setSelectedFile(null);
      setSelectedDeploymentId(data.id);
    },
  });

  useEffect(() => {
    if (selectedDeploymentId) {
      // Clear logs and connect to SSE
      setLogs([]);
      if (eventSourceRef.current) eventSourceRef.current.close();

      const es = new EventSource(`/api/deployments/${selectedDeploymentId}/logs`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const log = JSON.parse(event.data);
        setLogs((prev) => [...prev, log]);
      };

      es.onerror = () => {
        console.error('SSE connection failed');
        es.close();
      };

      return () => es.close();
    }
  }, [selectedDeploymentId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl && !selectedFile) return;
    mutation.mutate({ gitUrl, file: selectedFile || undefined });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-error" />;
      case 'pending':
      case 'building':
      case 'deploying': return <Loader2 className="w-4 h-4 animate-spin text-accent-color" />;
      default: return <Clock className="w-4 h-4 text-text-secondary" />;
    }
  };

  return (
    <div className="container">
      <header className="mb-12 flex justify-between items-center">
        <div>
          <h1 className="text-4xl mb-2 flex items-center gap-3">
            <Rocket className="text-accent-color w-10 h-10" />
            Antigravity PaaS
          </h1>
          <p className="text-text-secondary">Mini-PaaS deployment platform for rapid development.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Deploy Form */}
        <div className="lg:col-span-1">
          <div className="glass p-6 sticky top-8">
            <h2 className="text-xl mb-6">Deploy New App</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Github className="w-4 h-4" /> Git Repository URL
                </label>
                <input
                  type="text"
                  placeholder="https://github.com/user/repo"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  disabled={!!selectedFile}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border-color"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-bg-color px-2 text-text-secondary">Or upload archive</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Zip/Tarball
                </label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  disabled={!!gitUrl}
                />
              </div>

              <button
                type="submit"
                className="primary w-full flex justify-center items-center gap-2"
                disabled={mutation.isPending || (!gitUrl && !selectedFile)}
              >
                {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Deploy Now'}
              </button>
            </form>
          </div>
        </div>

        {/* Deployments List & Logs */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass p-6">
            <h2 className="text-xl mb-6">Deployments</h2>
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                {deployments?.map((dep: any) => (
                  <div
                    key={dep.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedDeploymentId === dep.id ? 'bg-panel-bg border-accent-color' : 'border-border-color hover:border-text-secondary'
                    }`}
                    onClick={() => setSelectedDeploymentId(dep.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(dep.status)}
                        <span className="font-mono text-sm">{dep.id.split('-')[0]}...</span>
                        <span className={`badge ${dep.status}`}>{dep.status}</span>
                      </div>
                      <span className="text-xs text-text-secondary">
                        {formatDistanceToNow(new Date(dep.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-sm text-text-secondary truncate mb-2">
                      Source: {dep.source_value}
                    </div>
                    {dep.live_url && (
                      <a
                        href={dep.live_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent-color flex items-center gap-1 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" /> View App
                      </a>
                    )}
                  </div>
                ))}
                {deployments?.length === 0 && (
                  <div className="text-center p-12 text-text-secondary">No deployments yet.</div>
                )}
              </div>
            )}
          </div>

          {/* Logs View */}
          {selectedDeploymentId && (
            <div className="glass p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-accent-color" />
                  Deployment Logs
                </h2>
                <span className="text-xs font-mono text-text-secondary">{selectedDeploymentId}</span>
              </div>
              <div className="log-panel">
                {logs.map((log, i) => (
                  <div key={i} className="log-line">
                    <span className="timestamp">[{new Date(log.emitted_at).toLocaleTimeString()}]</span>
                    <span className={`stage ${log.stage}`}>{log.stage.toUpperCase()}</span>
                    <span className="content">{log.line}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
