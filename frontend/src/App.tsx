import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeployments, createDeployment, getBuilds, rollbackDeployment, deleteDeployment } from './api';
import { Rocket, GitBranch, Upload, Loader2, ExternalLink, ScrollText, CheckCircle2, AlertCircle, Clock, RotateCcw, History, Trash2 } from 'lucide-react';
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
      setLogs([]); 
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDeployment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
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
          if (prev.find(l => l.id === log.id)) return prev;
          return [...prev, log];
        });
      };

      es.onerror = () => {
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
      case 'running': case 'succeeded': return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />;
      case 'failed': return <AlertCircle className="w-4 h-4" style={{ color: 'var(--error)' }} />;
      case 'deleted': return <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
      case 'pending':
      case 'building':
      case 'deploying': return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-cyan)' }} />;
      default: return <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const selectedDeployment = deployments?.find((d: any) => d.id === selectedDeploymentId);
  const isDeploying = selectedDeployment && ['pending', 'building', 'deploying'].includes(selectedDeployment.status);

  return (
    <div className="app-container">
      <header className="app-header flex justify-between items-center">
        <div>
          <h1 className="flex items-center gap-3">
            <Rocket /> Railgate PaaS
          </h1>
          <p>Next-generation, zero-downtime deployment engine.</p>
        </div>
      </header>

      <div className="app-grid">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Deploy Form */}
          <section className="glass-panel hoverable">
            <h2 className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-accent-cyan" /> New Deployment
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">
                  <GitBranch className="w-4 h-4" /> Git Repository URL
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="https://github.com/user/repo"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  disabled={!!selectedFile}
                />
              </div>

              <div className="divider">Or upload archive</div>

              <div className="form-group">
                <label className="form-label">
                  <Upload className="w-4 h-4" /> Zip/Tarball
                </label>
                <input
                  type="file"
                  className="input-field"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  disabled={!!gitUrl}
                  style={{ padding: '0.65rem 1rem' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={mutation.isPending || (!gitUrl && !selectedFile)}
              >
                {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Deploy App'}
              </button>
            </form>
          </section>

          {/* Deployments List */}
          <section className="glass-panel">
            <h2>Active Apps</h2>
            {isLoading ? (
              <div className="flex justify-center" style={{ padding: '3rem' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-indigo)' }} />
              </div>
            ) : (
              <div>
                {deployments?.map((dep: any) => (
                  <div
                    key={dep.id}
                    className={`deployment-card ${selectedDeploymentId === dep.id ? 'active' : ''}`}
                    onClick={() => setSelectedDeploymentId(dep.id)}
                  >
                    <div className="deployment-header">
                      <div className="deployment-title">
                        {getStatusIcon(dep.status)}
                        <span className="deployment-id">{dep.id.split('-')[0]}...</span>
                        <span className={`badge badge-${dep.status}`}>{dep.status}</span>
                      </div>
                      <span className="deployment-time">
                        {formatDistanceToNow(new Date(dep.created_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {dep.live_url && dep.status === 'running' && (
                        <a
                          href={dep.live_url}
                          target="_blank"
                          rel="noreferrer"
                          className="live-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" /> Open App
                        </a>
                      )}
                      {dep.status !== 'deleted' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(dep.id); }}
                          disabled={deleteMutation.isPending && deleteMutation.variables === dep.id}
                          className="btn-icon"
                          style={{ marginTop: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                          title="Delete Deployment"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === dep.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 hover:text-red-400 transition-colors" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {selectedDeploymentId ? (
            <>
              {/* Build History */}
              <section className="glass-panel">
                <h2 className="flex items-center gap-2 mb-6">
                  <History className="w-5 h-5" style={{ color: 'var(--accent-indigo)' }} />
                  Build History
                </h2>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Build ID</th>
                        <th>Status</th>
                        <th>Source</th>
                        <th>Deployed</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {builds?.map((build: any) => (
                        <tr key={build.id}>
                          <td className="font-mono" style={{ fontFamily: 'var(--font-mono)' }}>
                            {build.id.slice(0, 8)}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(build.status)}
                              <span style={{ textTransform: 'capitalize' }}>{build.status}</span>
                              {selectedDeployment?.active_build_id === build.id && (
                                <span className="badge badge-running" style={{ padding: '0.15rem 0.4rem', fontSize: '0.6rem' }}>Active</span>
                              )}
                            </div>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{build.source}</td>
                          <td>{formatDistanceToNow(new Date(build.created_at.replace(' ', 'T') + 'Z'))} ago</td>
                          <td className="text-right">
                            {build.status === 'succeeded' && selectedDeployment?.active_build_id !== build.id && (
                              <button 
                                onClick={() => rollbackMutation.mutate({ deploymentId: selectedDeploymentId, buildId: build.id })}
                                disabled={isDeploying || rollbackMutation.isPending}
                                className="btn btn-secondary"
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
                      {!builds?.length && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No builds recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Terminal Logs */}
              <section className="glass-panel">
                <h2 className="flex items-center gap-2 mb-6">
                  <ScrollText className="w-5 h-5" style={{ color: 'var(--accent-cyan)' }} />
                  Live Terminal
                  {isDeploying && <div className="status-dot active ml-2"></div>}
                </h2>
                <div className="log-terminal">
                  {logs.map((log) => (
                    <div key={log.id} className="log-line">
                      <span className="log-time">[{new Date(log.emitted_at).toLocaleTimeString()}]</span>
                      <span className={`log-stage ${log.stage}`}>{log.stage.toUpperCase()}</span>
                      <span className="log-content">{log.line}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </section>
            </>
          ) : (
            <div className="glass-panel empty-state">
              <Rocket className="w-20 h-20 empty-icon" />
              <h3>No Deployment Selected</h3>
              <p>Select an app from the sidebar to view its builds and live terminal.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
