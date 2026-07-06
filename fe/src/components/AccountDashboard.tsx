import React, { useState, useEffect, useRef } from "react"
import {
  Calendar,
  Database,
  Loader2,
  TrendingUp,
  Info,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

interface AccountOverview {
  address: string
  balance_sol: number
  owner: string
  executable: boolean
  data_size: number
}

interface BalanceHistoryPoint {
  timestamp: number
  balance_sol: number
}

interface SolChange {
  address: string
  pre_balance: number
  post_balance: number
  change_amount: number
  is_signer: boolean
  is_writable: boolean
}

interface TransactionItem {
  signature: string
  slot: number
  block_time: number
  err: boolean
  fee: number
  fee_payer: string
  logs: string[]
  sol_changes: SolChange[]
}

interface AccountDashboardProps {
  address: string
  rpcUrl: string
  backendUrl: string
  onSelectTransaction: (sig: string) => void
}

export const AccountDashboard: React.FC<AccountDashboardProps> = ({
  address,
  rpcUrl,
  backendUrl,
  onSelectTransaction,
}) => {
  const [overview, setOverview] = useState<AccountOverview | null>(null)
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryPoint[]>([])
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [source, setSource] = useState<"db" | "rpc" | "">("")
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [loadingChart, setLoadingChart] = useState(false)

  // Indexing State
  const [startDate, setStartDate] = useState("2026-06-01")
  const [endDate, setEndDate] = useState("2026-07-06")
  const [isIndexing, setIsIndexing] = useState(false)

  const [indexLogs, setIndexLogs] = useState<string[]>([])
  
  const [copiedAddress, setCopiedAddress] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Fetch all initial data
  useEffect(() => {
    if (address) {
      fetchOverview()
      fetchTransactions()
      fetchBalanceHistory()
      checkActiveIndexJob()
    }
  }, [address, rpcUrl])

  // Scroll to bottom of indexing terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [indexLogs])

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 2000)
  }

  const fetchOverview = async () => {
    setLoadingOverview(true)
    try {
      const res = await fetch(`${backendUrl}/api/account/${address}`, {
        headers: { "x-solana-rpc-url": rpcUrl },
      })
      if (res.ok) {
        const data = await res.json()
        setOverview(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingOverview(false)
    }
  }

  const fetchTransactions = async () => {
    setLoadingTransactions(true)
    try {
      const startSec = startDate ? new Date(startDate).getTime() / 1000 : undefined
      const endSec = endDate ? new Date(endDate).getTime() / 1000 + 86399 : undefined
      
      let url = `${backendUrl}/api/account/${address}/transactions?limit=25`
      if (startSec) url += `&start_date=${startSec}`
      if (endSec) url += `&end_date=${endSec}`

      const res = await fetch(url, {
        headers: { "x-solana-rpc-url": rpcUrl },
      })
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions)
        setSource(data.source)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTransactions(false)
    }
  }

  const fetchBalanceHistory = async () => {
    setLoadingChart(true)
    try {
      const startSec = startDate ? new Date(startDate).getTime() / 1000 : undefined
      const endSec = endDate ? new Date(endDate).getTime() / 1000 + 86399 : undefined
      
      let url = `${backendUrl}/api/account/${address}/balance-history?`
      if (startSec) url += `&start_date=${startSec}`
      if (endSec) url += `&end_date=${endSec}`

      const res = await fetch(url, {
        headers: { "x-solana-rpc-url": rpcUrl },
      })
      if (res.ok) {
        const data = await res.json()
        setBalanceHistory(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingChart(false)
    }
  }

  const checkActiveIndexJob = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/account/${address}/index`)
      if (res.ok) {
        const data = await res.json()
        if (data.active) {
          setIsIndexing(true)
          pollIndexProgress()
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  const handleStartIndexing = async () => {
    const startSec = Math.floor(new Date(startDate).getTime() / 1000)
    const endSec = Math.floor(new Date(endDate).getTime() / 1000 + 86399)

    setIsIndexing(true)
    setIndexLogs([`[${new Date().toLocaleTimeString()}] Requesting indexing job from backend...`])

    try {
      const res = await fetch(`${backendUrl}/api/account/${address}/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-solana-rpc-url": rpcUrl,
        },
        body: JSON.stringify({ start_date: startSec, end_date: endSec }),
      })

      if (res.status === 202) {
        setIndexLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Indexing job accepted. Crawling transactions...`])
        pollIndexProgress()
      } else {
        const errText = await res.text()
        setIndexLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Failed to start: ${errText}`])
        setIsIndexing(false)
      }
    } catch (e) {
      setIndexLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Connection error.`])
      setIsIndexing(false)
    }
  }

  const pollIndexProgress = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/account/${address}/index`)
        if (res.ok) {
          const data = await res.json()

          
          setIndexLogs((prev) => {
            const timeStr = new Date().toLocaleTimeString()
            const logLine = `[${timeStr}] Status: ${data.status} (Processed: ${data.processed}/${data.total_found}, Errors: ${data.errors})`
            // Avoid pushing duplicate log lines if status hasn't changed
            if (prev.length > 0 && prev[prev.length - 1] === logLine) {
              return prev
            }
            return [...prev, logLine]
          })

          if (!data.active) {
            clearInterval(interval)
            setIsIndexing(false)
            setIndexLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Indexing finished. Reloading database transactions...`])
            // Reload all lists after indexing
            fetchTransactions()
            fetchBalanceHistory()
          }
        } else {
          clearInterval(interval)
          setIsIndexing(false)
        }
      } catch (e) {
        clearInterval(interval)
        setIsIndexing(false)
      }
    }, 2000)
  }

  // Format Helper for Timestamps
  const formatTimestamp = (ts: number) => {
    if (ts === 0) return "N/A"
    const date = new Date(ts * 1000)
    return date.toLocaleDateString() + " " + date.toLocaleTimeString()
  }

  const getRelativeTime = (ts: number) => {
    if (ts === 0) return "N/A"
    const seconds = Math.floor(new Date().getTime() / 1000 - ts)
    if (seconds < 60) return `${seconds} secs ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} mins ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hrs ago`
    const days = Math.floor(hours / 24)
    return `${days} days ago`
  }

  // Find instruction names for list view
  const extractInstructionNames = (tx: TransactionItem) => {
    // Attempt parsing from raw data instructions or simple maps
    const raw: any = tx.logs || []
    const innerInstr: string[] = []
    
    // Scan logs for program execution details
    for (const log of raw) {
      if (typeof log === "string" && log.includes("Instruction:")) {
        const parts = log.split("Instruction:")
        if (parts[1]) {
          const name = parts[1].trim()
          if (!innerInstr.includes(name)) {
            innerInstr.push(name)
          }
        }
      }
    }

    if (innerInstr.length > 0) return innerInstr.slice(0, 3).join(", ")
    return "Transfer / Interact"
  }

  // Calculate Net SOL Balance change for current address
  const getNetSolChange = (tx: TransactionItem) => {
    const changeObj = tx.sol_changes.find(
      (c) => c.address.toLowerCase() === address.toLowerCase()
    )
    if (!changeObj) return 0
    return changeObj.change_amount / 1_000_000_000.0
  }

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border rounded-lg bg-card shadow-sm">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Account Address</div>
          <div className="flex items-center gap-2">
            <span className="text-sm md:text-lg font-mono font-bold select-all break-all">{address}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={copyAddress}>
              {copiedAddress ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-muted rounded-md p-1.5 text-xs border">
            <span className="font-semibold text-muted-foreground">Source:</span>
            <span className={`px-2 py-0.5 rounded font-bold uppercase ${
              source === "db" ? "bg-indigo-500/20 text-indigo-500" : "bg-orange-500/20 text-orange-500"
            }`}>
              {source || "fetching..."}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchOverview(); fetchTransactions(); fetchBalanceHistory(); }}>
            Refresh Dashboard
          </Button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glow-primary">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">SOL Balance</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              {loadingOverview ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <span>{overview?.balance_sol.toFixed(4) ?? "0.00"} SOL</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            ≈ ${( (overview?.balance_sol ?? 0) * 80.42 ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">Owner Program</CardDescription>
            <CardTitle className="text-sm font-mono truncate" title={overview?.owner}>
              {loadingOverview ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                overview?.owner ?? "System Program"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Solana Account Structure Owner
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">Executable</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-1.5">
              {loadingOverview ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : overview?.executable ? (
                <span className="text-emerald-500 flex items-center gap-1">Yes <CheckCircle2 className="h-5 w-5" /></span>
              ) : (
                <span className="text-muted-foreground">No</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Can execute programs on-chain
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">Allocated Data Size</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {loadingOverview ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                `${(overview?.data_size ?? 0).toLocaleString()} bytes`
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Account state space size
          </CardContent>
        </Card>
      </div>

      {/* Date Range Picker & Indexing controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />
              Filter Date Range & Database Indexing
            </CardTitle>
            <CardDescription>
              Select a date range to filter transactions from RPC, or index them permanently to PostgreSQL for fast SQL analytics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 bg-muted/30 p-4 rounded-lg border">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground">Start Date</label>
                <Input
                  type="date"
                  className="bg-background w-44"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground">End Date</label>
                <Input
                  type="date"
                  className="bg-background w-44"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => { fetchTransactions(); fetchBalanceHistory(); }}>
                  Apply Filter
                </Button>
                <Button
                  className="bg-indigo-600 text-white hover:bg-indigo-700 glow-primary"
                  onClick={handleStartIndexing}
                  disabled={isIndexing}
                >
                  {isIndexing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Index to Local Postgres
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Indexing terminal console logs */}
            {isIndexing || indexLogs.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase px-1">
                  <span>Indexing Console Log</span>
                  {isIndexing && <span className="text-indigo-500 animate-pulse">Running Background Sync...</span>}
                </div>
                <div className="bg-black text-emerald-400 font-mono text-[11px] p-4 rounded-lg h-36 overflow-y-auto border border-zinc-800 shadow-inner terminal-scroll space-y-1">
                  {indexLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Analytics card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Dashboard Analytics
            </CardTitle>
            <CardDescription>Metrics based on transaction logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
              <div className="text-xs font-bold text-muted-foreground uppercase">Transaction Success Rate</div>
              <div className="text-xl font-bold flex items-center justify-between">
                {transactions.length > 0 ? (
                  <>
                    <span>
                      {((transactions.filter(t => !t.err).length / transactions.length) * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({transactions.filter(t => !t.err).length} success / {transactions.length} total)
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No data</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
              <div className="text-xs font-bold text-muted-foreground uppercase">Avg Transaction Fee</div>
              <div className="text-xl font-bold">
                {transactions.length > 0 ? (
                  <span>
                    {(transactions.reduce((acc, t) => acc + t.fee, 0) / transactions.length / 1_000_000_000).toFixed(8)} SOL
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">No data</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SOL Balance over time chart */}
      <Card className="glow-primary">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">SOL Balance Over Time</CardTitle>
            <CardDescription>Reconstructed from indexed balance change events</CardDescription>
          </div>
          <TrendingUp className="h-5 w-5 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            {loadingChart ? (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : balanceHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.15)" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(tick) => new Date(tick * 1000).toLocaleDateString()}
                    stroke="currentColor"
                    className="text-[10px] text-muted-foreground"
                  />
                  <YAxis
                    stroke="currentColor"
                    className="text-[10px] text-muted-foreground"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      color: "hsl(var(--card-foreground))",
                    }}
                    labelFormatter={(label) => formatTimestamp(label)}
                    formatter={(value: any) => [`${parseFloat(value).toFixed(6)} SOL`, "Balance"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance_sol"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#balanceGlow)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg bg-muted/10 p-6">
                <Info className="h-8 w-8 mb-2" />
                <span className="text-sm font-semibold">No balance history data available</span>
                <span className="text-xs text-center mt-1">Index this account above to rebuild its history from transactions.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Transaction History</CardTitle>
          <CardDescription>Most recent transactions parsed from source</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTransactions ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signature</TableHead>
                  <TableHead>Block & Time</TableHead>
                  <TableHead>Instructions</TableHead>
                  <TableHead>By (Signer)</TableHead>
                  <TableHead className="text-right">Value Change</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const netChange = getNetSolChange(tx);
                  const isPositive = netChange > 0;
                  return (
                    <TableRow key={tx.signature} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-bold">
                        <button
                          onClick={() => onSelectTransaction(tx.signature)}
                          className="text-indigo-500 hover:underline text-left truncate max-w-[150px] inline-block font-mono"
                          title={tx.signature}
                        >
                          {tx.signature.substring(0, 8)}...{tx.signature.substring(tx.signature.length - 8)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold">{getRelativeTime(tx.block_time)}</div>
                        <div className="text-[10px] text-muted-foreground">{formatTimestamp(tx.block_time)}</div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={tx.logs.join("\n")}>
                        {extractInstructionNames(tx)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground" title={tx.fee_payer}>
                        {tx.fee_payer.substring(0, 6)}...{tx.fee_payer.substring(tx.fee_payer.length - 6)}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-bold ${
                        netChange === 0
                          ? "text-muted-foreground"
                          : isPositive
                          ? "text-emerald-500"
                          : "text-red-500"
                      }`}>
                        {netChange === 0 ? "" : isPositive ? "+" : ""}
                        {netChange === 0 ? "0.00" : netChange.toFixed(6)} SOL
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.err ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-500">
                            <XCircle className="h-3 w-3" /> Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" /> Success
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              No transactions found within this date range.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
