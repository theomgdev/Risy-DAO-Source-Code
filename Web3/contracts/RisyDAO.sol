// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

//RisyDAO ERC20
import "./RisyBase.sol";
/**
 * @title RisyDAO
 * @author Risy DAO
 * @notice RisyDAO contract is the main contract for Risy DAO Token.
 * @dev RisyDAO contract is the main contract for Risy DAO Token.
 * Features:
 * - Fully decentralized, safe and managed by KYC DAO (Owner is the DAO)
 * - Made with passion and coffee for blockchain nerds by the blockchain nerds
 * - Capped supply to 10x initial supply
 * - Daily transfer limit based on percentage of total balance for whale protection (default 10%)
 * - Transfer limit can be set or disabled by owner DAO
 * - DAO fee on transfer to owner DAO for DAO maintenance, development, and marketing (default 0.1%)
 * - DAO fee can be set or disabled by owner DAO
 * - Max balance limit for whale protection (default 0.25%)
 * - Max balance limit can be set or disabled by owner DAO
 * - DAO can be managed by RisyDAOManager contract
 * TODO: Trigger mechanism
 * TODO: LayerZero mechanism
 * (c) Risy DAO 2024. The MIT License.
 */
/// @custom:security-contact info@risy.io
contract RisyDAO is RisyBase {
    //Error for daily limit
    error ERC20DailyLimitError(address sender, uint256 transferredAmountToday, uint256 maxTransferAmount, uint256 remainingTransferLimit, uint256 percentTransferred);

    //Error for max balance limit
    error ERC20MaxBalanceLimitError(address account, uint256 balance, uint256 maxBalance);

    /// @custom:storage-location erc7201:risydao.storage
    struct RisyDAOStorage {
        uint256 timeWindow;
        uint256 transferLimitPercent; // Whale action protection
        uint256 maxBalance; //Whale hodl protection
        uint256 daoFee; // DAO maintenance, development, and marketing

        mapping(address => mapping(uint256 => uint256)) transferred;
    }

    // keccak256(abi.encode(uint256(keccak256("risydao.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant RisyDAOStorageLocation = 0x861e4c6f2c7fe5a627052b4d98aae3e7233dcc01b168a4301a06adb82a2c2500;

    function _getRisyDAOStorage() internal pure returns (RisyDAOStorage storage $) {
        bytes32 loc = RisyDAOStorageLocation;
        assembly {
            $.slot := loc
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, uint256 initialSupply) public initializer {
        initialSupply = initialSupply > 0 ? initialSupply : 10 ** 12; // 1,000,000,000,000
        initialSupply *= 10 ** decimals();

        RisyDAOStorage storage rs = _getRisyDAOStorage();
        rs.timeWindow = 86400; // 1 day in seconds for daily limit
        rs.transferLimitPercent = (10 * 10 ** decimals()) / 100; // 10% of total balance
        rs.maxBalance = (initialSupply * 25) / 1000; // 0.25% of total supply
        rs.daoFee = (1 * 10 ** decimals()) / 1000; // 0.1% DAO fee on transfer

        __RisyBase_init(initialOwner, initialSupply);
    }

    function _isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    function _currentDay() internal view returns (uint256) {
        return block.timestamp / _getRisyDAOStorage().timeWindow;
    }

    function _updateDailyTransferLimit(address sender, uint256 amount) internal {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        uint256 currentDay = _currentDay();
        uint256 dailyLimit = (balanceOf(sender) * rs.transferLimitPercent) / 10 ** decimals();

        if (rs.transferred[sender][currentDay] + amount > dailyLimit) {
            (uint256 transferredAmountToday, uint256 maxTransferAmount, uint256 remainingTransferLimit, uint256 percentTransferred) = getTransferLimitDetails(sender);
            revert ERC20DailyLimitError(sender, transferredAmountToday, maxTransferAmount, remainingTransferLimit, percentTransferred);
        }

        rs.transferred[sender][currentDay] += amount;
    }

    function _update(address from, address to, uint256 amount) internal override {
        RisyDAOStorage storage rs = _getRisyDAOStorage();

        // If not mint, burn, self or owner DAO
        if (from != address(0) && to != address(0) && from != to && from != owner() && to != owner()) {
            // Daily transfer limit
            if(rs.transferLimitPercent > 0 && rs.timeWindow > 0 && amount > 0) {
                _updateDailyTransferLimit(from, amount);
            }

            // Max balance limit
            if (rs.maxBalance > 0 && balanceOf(to) + amount > rs.maxBalance && !_isContract(to)) {
                revert ERC20MaxBalanceLimitError(to, balanceOf(to), rs.maxBalance);
            }

            // DAO fee
            if (rs.daoFee > 0) {
                uint256 fee = (amount * rs.daoFee) / 10 ** decimals();
                _transfer(from, owner(), fee);
                amount -= fee;
            }
        }

        super._update(from, to, amount);
    }

    function getTransferredAmountToday(address account) public view returns (uint256) {
        return _getRisyDAOStorage().transferred[account][_currentDay()];
    }

    function getMaxTransferAmount(address account) public view returns (uint256) {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        return (balanceOf(account) * rs.transferLimitPercent) / 10 ** decimals();
    }

    function getRemainingTransferLimit(address account) public view returns (uint256) {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        uint256 maxTransferAmount = getMaxTransferAmount(account);
        uint256 transferredAmountToday = getTransferredAmountToday(account);
        return maxTransferAmount > transferredAmountToday ? maxTransferAmount - transferredAmountToday : 0;
    }

    function getPercentTransferred(address account) public view returns (uint256) {
        uint256 maxTransferAmount = getMaxTransferAmount(account);
        return maxTransferAmount > 0 ? (getTransferredAmountToday(account) * 100) / maxTransferAmount : 0;
    }

    function getTransferLimitDetails(address account) public view returns (
        uint256 transferredAmountToday,
        uint256 maxTransferAmount,
        uint256 remainingTransferLimit,
        uint256 percentTransferred
    ) {
        transferredAmountToday = getTransferredAmountToday(account);
        maxTransferAmount = getMaxTransferAmount(account);
        remainingTransferLimit = getRemainingTransferLimit(account);
        percentTransferred = getPercentTransferred(account);
    }

    function getTransferLimit() public view returns (uint256 timeWindow, uint256 transferLimitPercent) {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        return (rs.timeWindow, rs.transferLimitPercent);
    }

    function getDAOFee() public view returns (uint256 daoFee) {
        return _getRisyDAOStorage().daoFee;
    }

    function getMaxBalance() public view returns (uint256 maxBalance) {
        return _getRisyDAOStorage().maxBalance;
    }

    function setTransferLimit(uint256 timeWindow_, uint256 transferLimitPercent_) public onlyOwner {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        rs.timeWindow = timeWindow_ > 0 ? timeWindow_ : 86400;
        rs.transferLimitPercent = transferLimitPercent_ > 0 ? transferLimitPercent_ : (10 * 10 ** decimals()) / 100;
    }

    function setDAOFee(uint256 daoFee_) public onlyOwner {
        _getRisyDAOStorage().daoFee = daoFee_;
    }

    function setMaxBalance(uint256 maxBalance_) public onlyOwner {
        _getRisyDAOStorage().maxBalance = maxBalance_;
    }
}