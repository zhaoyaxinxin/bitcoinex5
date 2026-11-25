// =============================================================================
//                                  Config 
// =============================================================================

// sets up web3.js
if (typeof web3 !== 'undefined')  {
	web3 = new Web3(web3.currentProvider);
} else {
	web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}

// Default account is the first one
web3.eth.defaultAccount = web3.eth.accounts[0];
// Constant we use later
var GENESIS = '0x0000000000000000000000000000000000000000000000000000000000000000';

// This is the ABI for your contract (get it from Remix, in the 'Compile' tab)
// Note: web3.min.js (0.20.6) checks `constant: true` on view functions to route calls via eth_call instead of sendTransaction.
// ============================================================
var abi = [
	{
		"constant": false,
		"inputs": [
			{"internalType": "address", "name": "creditor", "type": "address"},
			{"internalType": "uint32", "name": "amount", "type": "uint32"},
			{"internalType": "address[]", "name": "path", "type": "address[]"}
		],
		"name": "add_IOU",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [
			{"internalType": "address", "name": "debtor", "type": "address"},
			{"internalType": "address", "name": "creditor", "type": "address"}
		],
		"name": "lookup",
		"outputs": [{"internalType": "uint32", "name": "ret", "type": "uint32"}],
		"stateMutability": "view",
		"type": "function"
	}
];
// ============================================================
abiDecoder.addABI(abi);
// call abiDecoder.decodeMethod to use this - see 'getAllFunctionCalls' for more

// Reads in the ABI
var BlockchainSplitwiseContractSpec = web3.eth.contract(abi);

// This is the address of the contract you want to connect to; copy this from Remix
var contractAddress = '0x??????????????????????????????????????????????????????'.toLowerCase(); // FIXME: fill this in with your contract's address/hash after deploying to ganache-cli

var BlockchainSplitwise = BlockchainSplitwiseContractSpec.at(contractAddress)


// =============================================================================
//                            Functions To Implement 
// =============================================================================

// Helper: normalize address to lowercase for consistent comparison
function normalizeAddress(addr) {
	return addr ? addr.toLowerCase() : '';
}

// TODO: Return a list of all users (creditors or debtors) in the system
// You can return either:
//   - a list of everyone who has ever sent or received an IOU
// OR
//   - a list of everyone currently owing or being owed money
function getUsers() {
	var calls = getAllFunctionCalls(contractAddress, 'add_IOU');
	var seen = {};
	var users = [];
	for (var i = 0; i < calls.length; i++) {
		var debtor = normalizeAddress(calls[i].from);
		var creditor = normalizeAddress(calls[i].args[0]);
		if (debtor && !seen[debtor]) {
			seen[debtor] = true;
			users.push(debtor);
		}
		if (creditor && !seen[creditor]) {
			seen[creditor] = true;
			users.push(creditor);
		}
	}
	return users;
}

// TODO: Get the total amount owed by the user specified by 'user'
function getTotalOwed(user) {
	if (!user) return 0;
	var target = normalizeAddress(user);
	var users = getUsers();
	var total = 0;
	for (var i = 0; i < users.length; i++) {
		if (users[i] !== target) {
			total += BlockchainSplitwise.lookup(target, users[i]).toNumber();
		}
	}
	return total;
}

// TODO: Get the last time this user has sent or received an IOU, in seconds since Jan. 1, 1970
// Return null if you can't find any activity for the user.
// HINT: Try looking at the way 'getAllFunctionCalls' is written. You can modify it if you'd like.
function getLastActive(user) {
	if (!user) return null;
	var target = normalizeAddress(user);
	var calls = getAllFunctionCalls(contractAddress, 'add_IOU');
	var lastTime = null;
	for (var i = 0; i < calls.length; i++) {
		var debtor = normalizeAddress(calls[i].from);
		var creditor = normalizeAddress(calls[i].args[0]);
		if (debtor === target || creditor === target) {
			if (lastTime === null || calls[i].timestamp > lastTime) {
				lastTime = calls[i].timestamp;
			}
		}
	}
	return lastTime;
}

// TODO: add an IOU ('I owe you') to the system
// The person you owe money is passed as 'creditor'
// The amount you owe them is passed as 'amount'
function add_IOU(creditor, amount) {
	var debtor = normalizeAddress(web3.eth.defaultAccount);
	var targetCreditor = normalizeAddress(creditor);
	var amt = parseInt(amount, 10);
	if (!targetCreditor || !web3.isAddress(targetCreditor) || isNaN(amt) || amt <= 0 || targetCreditor === debtor) {
		console.error("Invalid IOU input:", creditor, amount);
		return;
	}

	var users = getUsers();
	var visited = {};
	visited[targetCreditor] = true;

	function getNeighbors(node) {
		var neighbors = [];
		for (var i = 0; i < users.length; i++) {
			var candidate = users[i];
			if (!visited[candidate] && BlockchainSplitwise.lookup(node, candidate).toNumber() > 0) {
				visited[candidate] = true;
				neighbors.push(candidate);
			}
		}
		return neighbors;
	}

	var path = doBFS(targetCreditor, debtor, getNeighbors);
	if (path === null) {
		path = [];
	}

	BlockchainSplitwise.add_IOU(targetCreditor, amt, path, {
		from: web3.eth.defaultAccount,
		gas: 500000
	});
}

// =============================================================================
//                              Provided Functions 
// =============================================================================
// Reading and understanding these should help you implement the above

// This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
// It returns an array of objects, one for each call, containing the sender ('from'), arguments ('args'), and block 'timestamp'
function getAllFunctionCalls(addressOfContract, functionName) {
	var curBlock = web3.eth.blockNumber;
	var function_calls = [];
	while (curBlock !== GENESIS) {
	  var b = web3.eth.getBlock(curBlock, true);
	  var txns = b.transactions;
	  for (var j = 0; j < txns.length; j++) {
	  	var txn = txns[j];
	  	// check that destination of txn is our contract
	  	if (txn.to && txn.to.toLowerCase() === addressOfContract.toLowerCase()) {
	  		var func_call = abiDecoder.decodeMethod(txn.input);
	  		// check that the function getting called in this txn is 'functionName'
	  		if (func_call && func_call.name === functionName) {
	  			var args = func_call.params.map(function (x) {return x.value});
	  			function_calls.push({
	  				from: txn.from,
	  				args: args,
	  				timestamp: b.timestamp
	  			})
	  		}
	  	}
	  }
	  curBlock = b.parentHash;
	}
	return function_calls;
}

// We've provided a breadth-first search implementation for you, if that's useful
// It will find a path from start to end (or return null if none exists)
// You just need to pass in a function ('getNeighbors') that takes a node (string) and returns its neighbors (as an array)
function doBFS(start, end, getNeighbors) {
	var queue = [[start]];
	while (queue.length > 0) {
		var cur = queue.shift();
		var lastNode = cur[cur.length-1]
		if (lastNode === end) {
			return cur;
		} else {
			var neighbors = getNeighbors(lastNode);
			for (var i = 0; i < neighbors.length; i++) {
				queue.push(cur.concat([neighbors[i]]));
			}
		}
	}
	return null;
}
// =============================================================================
//                                      UI 
// =============================================================================

// This code updates the 'My Account' UI with the results of your functions
$("#total_owed").html("$"+getTotalOwed(web3.eth.defaultAccount));
$("#last_active").html(timeConverter(getLastActive(web3.eth.defaultAccount)));
$("#myaccount").change(function() {
	web3.eth.defaultAccount = $(this).val();
	$("#total_owed").html("$"+getTotalOwed(web3.eth.defaultAccount));
	$("#last_active").html(timeConverter(getLastActive(web3.eth.defaultAccount)))
});

// Allows switching between accounts in 'My Account' and the 'fast-copy' in 'Address of person you owe
var opts = web3.eth.accounts.map(function (a) { return '<option value="'+a+'">'+a+'</option>' })
$(".account").html(opts);
$(".wallet_addresses").html(web3.eth.accounts.map(function (a) { return '<li>'+a+'</li>' }))

// This code updates the 'Users' list in the UI with the results of your function
$("#all_users").html(getUsers().map(function (u,i) { return "<li>"+u+"</li>" }));

// This runs the 'add_IOU' function when you click the button
// It passes the values from the two inputs above
$("#addiou").click(function() {
  add_IOU($("#creditor").val(), $("#amount").val());
  window.location.reload(true); // refreshes the page after
});

// This is a log function, provided if you want to display things to the page instead of the JavaScript console
// Pass in a discription of what you're printing, and then the object to print
function log(description, obj) {
	$("#log").html($("#log").html() + description + ": " + JSON.stringify(obj, null, 2) + "\n\n");
}


