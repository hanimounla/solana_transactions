import { useState, useEffect } from "react"
import { Database, Layers, Cpu } from "lucide-react"
import { Header } from "./components/Header"
import { AccountDashboard } from "./components/AccountDashboard"
import { TransactionView } from "./components/TransactionView"
import { Card, CardContent } from "./components/ui/card"

const BACKEND_URL = "http://localhost:8080"

function App() {
  const [network, setNetwork] = useState("devnet")
  const [rpcUrl, setRpcUrl] = useState("https://api.devnet.solana.com")
  const [searchAddress, setSearchAddress] = useState("")
  const [activeSignature, setActiveSignature] = useState("")

  // Handle URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      if (hash.startsWith("#/account/")) {
        const addr = hash.replace("#/account/", "")
        setSearchAddress(addr)
        setActiveSignature("")
      } else if (hash.startsWith("#/tx/")) {
        const sig = hash.replace("#/tx/", "")
        setSearchAddress("")
        setActiveSignature(sig)
      } else {
        setSearchAddress("")
        setActiveSignature("")
      }
    }

    // Run on initial load
    handleHashChange()

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const handleSearch = (query: string) => {
    if (!query) {
      window.location.hash = "#/"
      return
    }

    // Determine if it is a signature or address
    if (query.length > 50) {
      window.location.hash = `#/tx/${query}`
    } else {
      window.location.hash = `#/account/${query}`
    }
  }

  const selectDemoAccount = (addr: string) => {
    window.location.hash = `#/account/${addr}`
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Premium top navigation bar */}
      <Header
        network={network}
        setNetwork={setNetwork}
        rpcUrl={rpcUrl}
        setRpcUrl={setRpcUrl}
        onSearch={handleSearch}
        backendUrl={BACKEND_URL}
      />

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        {activeSignature ? (
          <TransactionView
            signature={activeSignature}
            rpcUrl={rpcUrl}
            backendUrl={BACKEND_URL}
            onBack={() => {
              window.location.hash = searchAddress ? `#/account/${searchAddress}` : "#/"
            }}
          />
        ) : searchAddress ? (
          <AccountDashboard
            address={searchAddress}
            rpcUrl={rpcUrl}
            backendUrl={BACKEND_URL}
            onSelectTransaction={(sig) => {
              window.location.hash = `#/tx/${sig}`
            }}
          />
        ) : (
          /* Welcome Portal View */
          <div className="space-y-12 py-10">
            {/* Hero Section */}
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                Solana Transaction Ledger Analytics
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Uncompromising Chain Visibility
              </h1>
              <p className="text-muted-foreground text-md md:text-lg">
                Explore comprehensive Solana transaction trees. Query on-chain data directly or index accounts into your local PostgreSQL database for instant time-series balance calculations.
              </p>
            </div>

            {/* Quick Demo Links */}
            <div className="max-w-2xl mx-auto border rounded-xl bg-card/60 p-6 space-y-4 shadow-xl glow-primary">
              <h3 className="text-md font-bold tracking-tight text-center">Quick Demo Explorer</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="cursor-pointer hover:border-indigo-500 transition-all border-muted/50 bg-background/50 hover:shadow-lg" onClick={() => selectDemoAccount("FBQ23w6WVetKYJMLCrtxqPn9pKg9rZbB8GcW4MT63YzA")}>
                  <CardContent className="p-4 space-y-2">
                    <div className="text-xs font-bold text-indigo-500">Signer / Fee Payer Account</div>
                    <div className="font-mono text-sm truncate">FBQ23w6WVetKYJMLCrtxqPn9pKg9rZbB8GcW4MT63YzA</div>
                    <div className="text-xs text-muted-foreground">Standard active wallet interface</div>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:border-indigo-500 transition-all border-muted/50 bg-background/50 hover:shadow-lg" onClick={() => selectDemoAccount("Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo")}>
                  <CardContent className="p-4 space-y-2">
                    <div className="text-xs font-bold text-indigo-500">Program / Smart Contract Account</div>
                    <div className="font-mono text-sm truncate">Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo</div>
                    <div className="text-xs text-muted-foreground">GMTrade smart contract program</div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto pt-6">
              <div className="border bg-card/40 rounded-xl p-5 space-y-3 shadow-md hover:-translate-y-1 transition-all">
                <div className="h-10 w-10 bg-indigo-500/10 text-indigo-500 flex items-center justify-center rounded-lg">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg">Local Indexing</h3>
                <p className="text-sm text-muted-foreground">
                  Synchronize account transactions directly to a local PostgreSQL instance. Avoid RPC rate-limiting on historical searches.
                </p>
              </div>

              <div className="border bg-card/40 rounded-xl p-5 space-y-3 shadow-md hover:-translate-y-1 transition-all">
                <div className="h-10 w-10 bg-indigo-500/10 text-indigo-500 flex items-center justify-center rounded-lg">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg">Balance Over Time</h3>
                <p className="text-sm text-muted-foreground">
                  Construct a detailed chart showing history of SOL holdings based on net ledger changes.
                </p>
              </div>

              <div className="border bg-card/40 rounded-xl p-5 space-y-3 shadow-md hover:-translate-y-1 transition-all">
                <div className="h-10 w-10 bg-indigo-500/10 text-indigo-500 flex items-center justify-center rounded-lg">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg">Compute & Logs</h3>
                <p className="text-sm text-muted-foreground">
                  Trace log files and observe compute units (CU) consumed per instruction.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/30 py-6 text-center text-xs text-muted-foreground">
        <div className="container mx-auto">
          SolSight © 2026. Built on Rust, React, and PostgreSQL.
        </div>
      </footer>
    </div>
  )
}

export default App
