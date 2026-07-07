# getSignaturesForAddress | Solana

[Solana RPC Methods](/docs)[HTTP Methods](/docs/rpc/http)

# [getSignaturesForAddress](/docs/rpc/http/getsignaturesforaddress)

Copy MarkdownOpen

Returns confirmed transaction signatures for transactions that reference the supplied address in `accountKeys`, newest first.

Source

[`get_signatures_for_address`](https://github.com/anza-xyz/agave/blob/v3.1.8/rpc/src/rpc.rs#L1816)

#### params

stringrequired

Account address as base-58 encoded string

objectoptional

Configuration object containing the following fields:

commitmentstring

minContextSlotnumber

limitusize

Maximum transaction signatures to return (between 1 and 1,000).

beforestring

untilstring

#### result

array

An array of transaction signature information objects, ordered from **newest** to **oldest** transaction, containing:

signaturestring

slotu64

errobject | string | null

memostring | null

blockTimei64 | null

confirmationStatusstring | null

cURL

Kit

web3.js

Rust

$ curl https://api.devnet.solana.com -s -X \\

\>   POST -H "Content-Type: application/json" -d ' 

\>   {

\>     "jsonrpc": "2.0",

\>     "id": 1,

\>     "method": "getSignaturesForAddress",

\>     "params": \[

\>       "Vote111111111111111111111111111111111111111",

\>       {

\>         "commitment": "finalized",

\>         "limit": 1

\>       }

\>     \]

\>   }

\> '

Try it

Response

{

  "jsonrpc": "2.0",

  "result": \[

    {

      "signature": "5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv",

      "slot": 114,

      "err": null,

      "memo": null,

      "blockTime": null,

      "confirmationStatus": "finalized"

    }

  \],

  "id": 1

}

cURL

Kit

web3.js

Rust

$ curl https://api.devnet.solana.com -s -X \\

\>   POST -H "Content-Type: application/json" -d ' 

\>   {

\>     "jsonrpc": "2.0",

\>     "id": 1,

\>     "method": "getSignaturesForAddress",

\>     "params": \[

\>       "Vote111111111111111111111111111111111111111",

\>       {

\>         "commitment": "finalized",

\>         "limit": 1

\>       }

\>     \]

\>   }

\> '

Try it

#### params

stringrequired

Account address as base-58 encoded string

objectoptional

Configuration object containing the following fields:

commitmentstring

minContextSlotnumber

limitusize

beforestring

untilstring

#### result

Response

{

  "jsonrpc": "2.0",

  "result": \[

    {

      "signature": "5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv",

      "slot": 114,

      "err": null,

      "memo": null,

      "blockTime": null,

      "confirmationStatus": "finalized"

    }

  \],

  "id": 1

}

array

An array of transaction signature information objects, ordered from **newest** to **oldest** transaction, containing:

signaturestring

slotu64

errobject | string | null

memostring | null

blockTimei64 | null

confirmationStatusstring | null

Is this page helpful?

[

Previous

getRecentPrioritizationFees

](/docs/rpc/http/getrecentprioritizationfees)[

Next

getSignatureStatuses

](/docs/rpc/http/getsignaturestatuses)

Ask AI