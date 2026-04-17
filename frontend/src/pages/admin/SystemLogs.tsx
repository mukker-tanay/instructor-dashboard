import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSystemLogs, SystemLog } from '../../api/client';
import { AlertCircle, FileText, ChevronDown, ChevronRight, RefreshCw, XCircle } from 'lucide-react';

const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
        case 'ERROR': return 'text-red-500 bg-red-500/10 border-red-500/20';
        case 'WARNING': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
        case 'INFO': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
};

const LogRow: React.FC<{ log: SystemLog }> = ({ log }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors">
            <div 
                className="grid grid-cols-12 gap-4 p-4 cursor-pointer items-center text-sm"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="col-span-2 text-slate-400 font-mono text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                </div>
                <div className="col-span-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getLevelColor(log.level)}`}>
                        {log.level}
                    </span>
                </div>
                <div className="col-span-3 text-slate-300 font-mono text-xs truncate" title={log.logger_name}>
                    {log.logger_name}
                </div>
                <div className="col-span-4 text-slate-200 truncate flex items-center">
                    {log.message}
                </div>
                <div className="col-span-1 flex justify-end text-slate-500">
                    {(log.trace || log.metadata) && (
                        expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />
                    )}
                </div>
            </div>
            
            {expanded && (log.trace || log.metadata) && (
                <div className="p-4 pt-0 bg-slate-900/50 font-mono text-xs overflow-x-auto">
                    {log.metadata && (
                        <div className="mb-2 text-slate-400">
                            <strong>Metadata:</strong>
                            <pre className="mt-1 text-slate-300">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    )}
                    {log.trace && (
                        <div className="text-red-400">
                            <strong>Trace:</strong>
                            <pre className="mt-1 whitespace-pre-wrap">{log.trace}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const SystemLogs: React.FC = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterLevel, setFilterLevel] = useState<string>('ALL');

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const level = filterLevel === 'ALL' ? undefined : filterLevel;
            const data = await getSystemLogs(level, 100);
            setLogs(data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to fetch logs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchLogs();
        }
    }, [user, filterLevel]);

    if (user?.role !== 'admin') {
        return (
            <div className="max-w-7xl mx-auto px-4 py-12 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                <p className="text-slate-400">You do not have permission to view system logs.</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                        <FileText className="text-indigo-400" />
                        System Logs
                    </h1>
                    <p className="text-slate-400 mt-2">Real-time backend system alerts and errors.</p>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 pl-3 pr-10"
                    >
                        <option value="ALL">All Levels</option>
                        <option value="ERROR">Error</option>
                        <option value="WARNING">Warning</option>
                        <option value="INFO">Info</option>
                    </select>
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-800 bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                    <div className="col-span-2">Timestamp</div>
                    <div className="col-span-2">Level</div>
                    <div className="col-span-3">Logger</div>
                    <div className="col-span-4">Message</div>
                    <div className="col-span-1"></div>
                </div>
                
                <div className="divide-y divide-slate-800/50 min-h-[400px]">
                    {loading && logs.length === 0 ? (
                        <div className="flex items-center justify-center h-64 text-slate-400">
                            Loading logs...
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex items-center justify-center h-64 text-slate-400">
                            No logs found for this filter.
                        </div>
                    ) : (
                        logs.map(log => <LogRow key={log.id} log={log} />)
                    )}
                </div>
            </div>
        </div>
    );
};
