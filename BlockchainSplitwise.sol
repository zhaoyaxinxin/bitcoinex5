// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BlockchainSplitwise {
    // debts[debtor][creditor] records how much debtor owes creditor.
    mapping(address => mapping(address => uint32)) private debts;

    /**
     * @notice Return the amount debtor owes creditor.
     */
    function lookup(address debtor, address creditor) public view returns (uint32 ret) {
        return debts[debtor][creditor];
    }

    /**
     * @notice Add an IOU from msg.sender to creditor, optionally resolving a cycle along `path`.
     * @param creditor Address of the creditor.
     * @param amount Positive IOU amount to add.
     * @param path Empty if no cycle exists; otherwise [creditor, ..., msg.sender] forming a simple path.
     */
    function add_IOU(address creditor, uint32 amount, address[] calldata path) public {
        require(creditor != address(0), "Invalid creditor");
        require(amount > 0, "Amount must be positive");
        require(msg.sender != creditor, "Cannot owe yourself");

        if (path.length == 0) {
            debts[msg.sender][creditor] += amount;
            return;
        }

        require(path.length >= 2, "Invalid path length");
        require(path[0] == creditor, "Path must start with creditor");
        require(path[path.length - 1] == msg.sender, "Path must end with sender");

        uint32 newDebt = debts[msg.sender][creditor] + amount;
        uint32 minDebt = newDebt;

        for (uint256 i = 0; i < path.length - 1; i++) {
            for (uint256 j = i + 1; j < path.length; j++) {
                require(path[i] != path[j], "Duplicate node in path");
            }
            uint32 edgeDebt = debts[path[i]][path[i + 1]];
            require(edgeDebt > 0, "Invalid edge in path");
            if (edgeDebt < minDebt) {
                minDebt = edgeDebt;
            }
        }

        debts[msg.sender][creditor] = newDebt - minDebt;
        for (uint256 i = 0; i < path.length - 1; i++) {
            debts[path[i]][path[i + 1]] -= minDebt;
        }
    }
}
