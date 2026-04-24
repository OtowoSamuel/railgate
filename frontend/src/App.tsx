import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeployments, createDeployment, getBuilds, rollbackDeployment } from './api';
import { Rocket, GitBranch, Upload, Loader2, ExternalLink, ScrollText, CheckCircle2, AlertCircle, Clock, RotateCcw, History } from 'lucide-react';
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
    refetchInterval: 3000,
  });

  const { data: builds } = useQuery({
    queryKey: ['builds', selectedDeploymentId],
    queryFn: () => getBuilds(selectedDeploymentId!),
    enabled: !!selectedDeploymentId,
    refetchInterval: 3000,
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

  const rollbackMutation = useMutation({
    mutationFn: ({ deploymentId, buildId }: { deploymentId: string, buildId: string }) => rollbackDeployment(deploymentId, buildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['builds', selectedDeploymentId] });
      setLogs([]); // Clear logs on rollback to see new deployment logs
    }
  });

  useEffect(() => {
    if (selectedDeploymentId) {
      setLogs([]);
      if (eventSourceRef.current) eventSourceRef.current.close();

      const es = new EventSource(`/api/deployments/${selectedDeploymentId}/logs`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const log = JSON.parse(event.data);
        setLogs((prev) => {
          // Prevent duplicates if EventSource reconnects
          if (prev.find(l => l.id === log.id)) return prev;
          return [...prev, log];
        });
      };

      es.onerror = () => {
        // EventSource auto-reconnects, but if it fails completely we can log it
        console.error('SSE connection error. Reconnecting...');
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
      case 'running': case 'succeeded': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-error" />;
      case 'pending':
      case 'building':
      case 'deploying': return <Loader2 className="w-4 h-4 animate-spin text-accent-color" />;
      default: return <Clock className="w-4 h-4 text-text-secondary" />;
    }
  };

  const selectedDeployment = deployments?.find((d: any) => d.id === selectedDeploymentId);
  const isDeploying = selectedDeployment && ['pending', 'building', 'deploying'].includes(selectedDeployment.status);

  return (
    <div className="container">
      <header className="mb-12 flex justify-between items-center">
        <div>
          <h1 className="text-4xl mb-2 flex items-center gap-3">
            <Rocket className="text-accent-color w-10 h-10" />
            Railgate PaaS
          </h1>
          <p className="text-text-secondary">Zero-downtime deployment platform.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Deploy Form & Deployments List */}
        <div className="lg:col-span-1 space-y-8">
          <div className="glass p-6">
            <h2 className="text-xl mb-6">Deploy New App</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <GitBranch className="w-4 h-4" /> Git Repository URL
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
                    {dep.live_url && (
                      <a
                        href={dep.live_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent-color flex items-center gap-1 hover:underline mt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" /> Visit App
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Details & Logs */}
        <div className="lg:col-span-2 space-y-8">
          {selectedDeploymentId ? (
            <>
              {/* Build History */}
              <div className="glass p-6">
                <h2 className="text-xl flex items-center gap-2 mb-6">
                  <History className="w-5 h-5 text-accent-color" />
                  Build History
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-panel-bg text-text-secondary border-b border-border-color">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Age</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {builds?.map((build: any) => (
                        <tr key={build.id} className="border-b border-border-color hover:bg-panel-bg">
                          <td className="px-4 py-3 font-mono">{build.id.slice(0, 8)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(build.status)}
                              {build.status}
                              {selectedDeployment?.active_build_id === build.id && (
                                <span className="ml-2 text-[10px] uppercase bg-accent-color text-white px-2 py-0.5 rounded-full">Active</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">{build.source}</td>
                          <td className="px-4 py-3">{formatDistanceToNow(new Date(build.created_at))}</td>
                          <td className="px-4 py-3 text-right">
                            {build.status === 'succeeded' && selectedDeployment?.active_build_id !== build.id && (
                              <button 
                                onClick={() => rollbackMutation.mutate({ deploymentId: selectedDeploymentId, buildId: build.id })}
                                disabled={isDeploying || rollbackMutation.isPending}
                                className="flex items-center gap-1 text-xs bg-panel-bg hover:bg-white/10 px-3 py-1.5 rounded disabled:opacity-50"
                              >
                                {rollbackMutation.isPending && rollbackMutation.variables?.buildId === build.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Rollback
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Logs View */}
              <div className="glass p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl flex items-center gap-2">
                    <ScrollText className="w-5 h-5 text-accent-color" />
                    Live Logs
                  </h2>
                </div>
                <div className="log-panel">
                  {logs.map((log) => (
                    <div key={log.id} className="log-line">
                      <span className="timestamp">[{new Date(log.emitted_at).toLocaleTimeString()}]</span>
                      <span className={`stage ${log.stage}`}>{log.stage.toUpperCase()}</span>
                      <span className="content">{log.line}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </>
          ) : (
            <div className="glass p-12 text-center text-text-secondary h-full flex flex-col items-center justify-center">
              <ScrollText className="w-16 h-16 mb-4 opacity-20" />
              <p>Select a deployment to view history and logs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
