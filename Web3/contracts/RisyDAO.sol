// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

//RisyDAO Automation Trigger
import "./ITrigger.sol";
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
 * - Max balance limit for whale protection (default 0.75%)
 * - Max balance limit can be set or disabled by owner DAO
 * - Trigger mechanism for automation
 * - DAO can be managed by RisyDAOManager contract
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
        uint256 version;
        uint256 timeWindow;
        uint256 transferLimitPercent; // Whale action protection
        uint256 maxBalance; //Whale hodl protection
        uint256 daoFee; // DAO maintenance, development, and marketing

        address trigger; // Trigger mechanism

        // Whitelist for daily limit (mostly for dApps and exchanges)
        mapping(address => bool) whiteList;
        // Daily limit tracking
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
        
        rs.version = 1;
        rs.timeWindow = 86400; // 1 day in seconds for daily limit
        rs.transferLimitPercent = (10 * 10 ** decimals()) / 100; // 10% of total balance
        rs.maxBalance = (initialSupply * 75) / 1000; // 0.75% of total supply
        rs.daoFee = (1 * 10 ** decimals()) / 1000; // 0.1% DAO fee on transfer
        rs.trigger = address(0); // Trigger mechanism

        __RisyBase_init(initialOwner, initialSupply);
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / _getRisyDAOStorage().timeWindow;
    }

    function _increaseTransferred(address account, uint256 amount) internal {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        rs.transferred[account][currentDay()] += amount;
    }

    function _updateDailyTransferLimit(address sender, uint256 amount) internal {
        if (getTransferredAmountToday(sender) + amount > getMaxTransferAmount(sender)) {
            (uint256 transferredAmountToday, uint256 maxTransferAmount, uint256 remainingTransferLimit, uint256 percentTransferred) = getTransferLimitDetails(sender);
            revert ERC20DailyLimitError(sender, transferredAmountToday, maxTransferAmount, remainingTransferLimit, percentTransferred);
        }

        _increaseTransferred(sender, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        RisyDAOStorage storage rs = _getRisyDAOStorage();

        // If not mint, burn, self or owner DAO
        if (from != address(0) && to != address(0) && from != to && from != owner() && to != owner()) {
            // Daily transfer limit
            if(rs.transferLimitPercent > 0 && rs.timeWindow > 0 && amount > 0 && !isWhiteListed(from)) {
                _updateDailyTransferLimit(from, amount);
            }

            // Max balance limit
            if (rs.maxBalance > 0 && balanceOf(to) + amount > rs.maxBalance && !isWhiteListed(to)) {
                revert ERC20MaxBalanceLimitError(to, balanceOf(to), rs.maxBalance);
            }

            // DAO fee
            if (rs.daoFee > 0 && !isWhiteListed(from)) {
                uint256 fee = (amount * rs.daoFee) / 10 ** decimals();
                _transfer(from, owner(), fee);
                amount -= fee;
            }
        }

        super._update(from, to, amount);

        if(from != rs.trigger && to != rs.trigger && _msgSender() != rs.trigger) {
            trigger();
        }
    }

    // Try to run rs.trigger.trigger(callData) if rs.trigger is not address(0)
    function trigger() public {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        if (rs.trigger != address(0) && _msgSender() != rs.trigger) {
            try ITrigger(rs.trigger).trigger() {} catch {}
        }
    }

    // Flash fee is 0,1% of the amount borrowed to be paid by the borrower to the owner DAO
    function flashFee(address token, uint256 amount) public view override returns (uint256) {
        if (token != address(this)) {
            revert ERC3156UnsupportedToken(token);
        }
        
        return (amount * _getRisyDAOStorage().daoFee) / 10 ** decimals();
    }

    function getTransferredAmountToday(address account) public view returns (uint256) {
        return _getRisyDAOStorage().transferred[account][currentDay()];
    }

    function getMaxTransferAmount(address account) public view returns (uint256) {
        RisyDAOStorage storage rs = _getRisyDAOStorage();

        return (balanceOf(account) * rs.transferLimitPercent) / 10 ** decimals();
    }

    function getRemainingTransferLimit(address account) public view returns (uint256) {
        uint256 maxTransferAmount = getMaxTransferAmount(account);
        uint256 transferredAmountToday = getTransferredAmountToday(account);
        return maxTransferAmount > transferredAmountToday ? maxTransferAmount - transferredAmountToday : 0;
    }

    function getPercentTransferred(address account) public view returns (uint256) {
        uint256 maxTransferAmount = getMaxTransferAmount(account);
        return maxTransferAmount > 0 ? (getTransferredAmountToday(account) * 10 ** decimals()) / maxTransferAmount : 0;
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

    function isWhiteListed(address account) public view returns (bool) {
        return _getRisyDAOStorage().whiteList[account];
    }

    function getTransferLimit() public view returns (uint256, uint256) {
        RisyDAOStorage storage rs = _getRisyDAOStorage();
        return (rs.timeWindow, rs.transferLimitPercent);
    }

    function getDAOFee() public view returns (uint256) {
        return _getRisyDAOStorage().daoFee;
    }

    function getMaxBalance() public view returns (uint256) {
        return _getRisyDAOStorage().maxBalance;
    }

    function getTrigger() public view returns (address) {
        return _getRisyDAOStorage().trigger;
    }

    function getVersion() public view returns (uint256) {
        return _getRisyDAOStorage().version;
    }

    function setWhiteList(address account, bool whiteListed) public onlyOwner {
        _getRisyDAOStorage().whiteList[account] = whiteListed;
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

    function setTrigger(address trigger_) public onlyOwner {
        _getRisyDAOStorage().trigger = trigger_;
    }

    function upgradeToAndCall(address newImplementation, bytes memory data) public payable override onlyProxy {
        super.upgradeToAndCall(newImplementation, data);

        _getRisyDAOStorage().version++;
    }
}