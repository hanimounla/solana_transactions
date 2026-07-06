import React, { useState, useEffect } from "react"
import { ArrowLeft, Clock, Cpu, FileJson, CheckCircle2, XCircle, Code, Copy, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card"
import { Button } from "./ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface SolChange {
  address: string
  pre_balance: number
  post_balance: number
  change_amount: number
  is_signer: boolean
  is_writable: boolean
}

interface TokenChange {
  address: string
  mint: string
  owner: string
  pre_amount: number
  post_amount: number
  change_amount: number
  decimals: number
}

interface FullTransactionDetail {
  signature: string
  slot: number
  block_time: number
  err: boolean
  fee: number
  fee_payer: string
  logs: string[]
  raw_data: any
  sol_changes: SolChange[]
  token_changes: TokenChange[]
}

interface TransactionViewProps {
  signature: string
  rpcUrl: string
  backendUrl: string
  onBack: () => void
}

export const TransactionView: React.FC<TransactionViewProps> = ({
  signature,
  rpcUrl,
  backendUrl,
  onBack,
}) => {
  const [tx, setTx] = useState<FullTransactionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [copiedSig, setCopiedSig] = useState(false)

  useEffect(() => {
    fetchTxDetails()
  }, [signature, rpcUrl])

  const fetchTxDetails = async () => {
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await fetch(`${backendUrl}/api/transaction/${signature}`, {
        headers: { "x-solana-rpc-url": rpcUrl },
      })
      if (res.ok) {
        const data = await res.json()
        setTx(data)
      } else {
        setErrorMsg("Failed to retrieve transaction details.")
      }
    } catch (e) {
      setErrorMsg("Network error trying to fetch transaction.")
    } finally {
      setLoading(false)
    }
  }

  const copySignature = () => {
    navigator.clipboard.writeText(signature)
    setCopiedSig(true)
    setTimeout(() => setCopiedSig(false), 2000)
  }

  // Format Helper for Timestamps
  const formatTimestamp = (ts: number) => {
    if (ts === 0) return "N/A"
    const date = new Date(ts * 1000)
    return date.toLocaleDateString() + " " + date.toLocaleTimeString()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <span className="text-sm font-semibold text-muted-foreground">Loading Transaction Data...</span>
      </div>
    )
  }

  if (errorMsg || !tx) {
    return (
      <Card className="max-w-xl mx-auto border-destructive/20 bg-destructive/5 mt-10">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <XCircle className="h-5 w-5" /> Transaction Error
          </CardTitle>
          <CardDescription>{errorMsg || "Transaction not found."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </CardContent>
      </Card>
    )
  }

  const meta = tx.raw_data?.meta || {}
  const rawTx = tx.raw_data?.transaction || {}
  const recentBlockhash = rawTx.message?.recentBlockhash || "N/A"
  const addressTableLookups = rawTx.message?.addressTableLookups || []

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" className="-ml-3" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Account Dashboard
      </Button>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border rounded-lg bg-card shadow-sm">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Transaction Signature</div>
          <div className="flex items-center gap-2">
            <span className="text-sm md:text-lg font-mono font-bold select-all break-all">{tx.signature}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={copySignature}>
              {copiedSig ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div>
          {tx.err ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
              <XCircle className="h-4 w-4" /> Failed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4" /> Success
            </span>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full space-y-4">
        <TabsList className="bg-muted/50 border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="changes">Balance Changes</TabsTrigger>
          <TabsTrigger value="logs">Instructions & Logs</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-lg">Overview Details</CardTitle>
              <CardDescription>General metadata of this transaction</CardDescription>
            </CardHeader>
            <CardContent className="divide-y p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Block Slot</div>
                <div className="col-span-2 text-sm font-mono font-semibold">
                  #{tx.slot.toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Timestamp</div>
                <div className="col-span-2 text-sm flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{formatTimestamp(tx.block_time)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Signer (Fee Payer)</div>
                <div className="col-span-2 text-sm font-mono truncate break-all">{tx.fee_payer}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Transaction Fee</div>
                <div className="col-span-2 text-sm">
                  <span className="font-semibold font-mono">{(tx.fee / 1_000_000_000).toFixed(8)} SOL</span>
                  <span className="text-xs text-muted-foreground ml-2">≈ ${( (tx.fee / 1_000_000_000) * 80.42 ).toFixed(5)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Compute Units Consumed</div>
                <div className="col-span-2 text-sm font-mono flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span>{(meta.computeUnitsConsumed ?? 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Recent Blockhash</div>
                <div className="col-span-2 text-sm font-mono truncate">{recentBlockhash}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4 items-center">
                <div className="text-sm font-bold text-muted-foreground">Address Lookup Tables</div>
                <div className="col-span-2 text-sm">
                  {addressTableLookups.length > 0 ? (
                    <div className="space-y-1">
                      {addressTableLookups.map((lut: any, i: number) => (
                        <div key={i} className="text-xs font-mono truncate">{lut.accountKey}</div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">None</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Balance Changes */}
        <TabsContent value="changes" className="space-y-6">
          {/* SOL changes table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SOL Balance Changes</CardTitle>
              <CardDescription>Writable and Signer account balances affected by transaction execution</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Balance Before</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                    <TableHead className="text-right">Change (SOL)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tx.sol_changes.map((sc, i) => {
                    const chg = sc.change_amount / 1_000_000_000.0
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs truncate max-w-[180px]" title={sc.address}>
                          {sc.address}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {sc.is_signer && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-500">Signer</span>
                            )}
                            {sc.is_writable && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-500">Writable</span>
                            )}
                            {sc.address === tx.fee_payer && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-500/10 text-zinc-500">Fee Payer</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{(sc.pre_balance / 1_000_000_000).toFixed(6)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{(sc.post_balance / 1_000_000_000).toFixed(6)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs font-bold ${
                          chg > 0 ? "text-emerald-500" : chg < 0 ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {chg > 0 ? "+" : ""}{chg.toFixed(8)} SOL
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Token changes table */}
          {tx.token_changes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">SPL Token Balance Changes</CardTitle>
                <CardDescription>Token amounts altered during this execution</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account / Owner</TableHead>
                      <TableHead>Token Mint</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tx.token_changes.map((tc, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">
                          <div className="truncate max-w-[150px]" title={tc.address}>ATA: {tc.address}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[150px]" title={tc.owner}>Owner: {tc.owner}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[180px]" title={tc.mint}>
                          {tc.mint}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{tc.pre_amount.toFixed(tc.decimals)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{tc.post_amount.toFixed(tc.decimals)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs font-bold ${
                          tc.change_amount > 0 ? "text-emerald-500" : "text-red-500"
                        }`}>
                          {tc.change_amount > 0 ? "+" : ""}{tc.change_amount.toFixed(tc.decimals)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 3: Instructions & Logs */}
        <TabsContent value="logs" className="space-y-4">
          {/* Program Instructions list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code className="h-5 w-5 text-indigo-500" />
                Instruction Invocations
              </CardTitle>
              <CardDescription>Programs invoked inside this transaction message</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rawTx.message?.instructions?.map((inst: any, idx: number) => {
                // Find program name matching index
                const programKeys = rawTx.message?.accountKeys || []
                let loadedKeys: string[] = []
                if (meta.loadedAddresses) {
                  loadedKeys = [...meta.loadedAddresses.writable, ...meta.loadedAddresses.readonly]
                }
                const allKeys = [...programKeys, ...loadedKeys]
                const programId = allKeys[inst.programIdIndex] || "Unknown Program"
                
                return (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between border rounded-lg p-3 bg-muted/20 gap-2">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-indigo-500">Instruction #{idx + 1}</div>
                      <div className="font-mono text-sm font-semibold truncate max-w-sm md:max-w-md" title={programId}>
                        Program ID: {programId}
                      </div>
                    </div>
                    {inst.data && (
                      <div className="font-mono text-xs bg-muted border px-2 py-1 rounded truncate max-w-xs text-muted-foreground">
                        Data: {inst.data}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Program log terminal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Program Execution Logs</CardTitle>
              <CardDescription>On-chain debug logs generated during smart contract execution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-black text-emerald-400 font-mono text-[11px] p-4 rounded-lg h-72 overflow-y-auto border border-zinc-800 shadow-inner terminal-scroll space-y-1">
                {tx.logs.length > 0 ? (
                  tx.logs.map((log, i) => {
                    const isSuccess = log.includes("success")
                    const isFailure = log.includes("fail") || log.includes("error") || log.includes("failed")
                    const isInstruction = log.includes("Instruction:")
                    
                    let colorClass = "text-zinc-300"
                    if (isSuccess) colorClass = "text-emerald-400 font-bold"
                    else if (isFailure) colorClass = "text-red-400 font-bold"
                    else if (isInstruction) colorClass = "text-indigo-400 font-semibold"

                    return (
                      <div key={i} className={`leading-relaxed whitespace-pre-wrap ${colorClass}`}>{log}</div>
                    )
                  })
                ) : (
                  <div className="text-zinc-500 italic">No program execution logs available for this transaction.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Raw JSON */}
        <TabsContent value="raw">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
              <div>
                <CardTitle className="text-lg">Raw JSON Response</CardTitle>
                <CardDescription>Inspect the unparsed block explorer object returned directly from Solana RPC</CardDescription>
              </div>
              <FileJson className="h-5 w-5 text-indigo-500" />
            </CardHeader>
            <CardContent className="p-0">
              <pre className="bg-muted/30 p-4 font-mono text-xs overflow-auto max-h-96 text-card-foreground">
                {JSON.stringify(tx.raw_data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
